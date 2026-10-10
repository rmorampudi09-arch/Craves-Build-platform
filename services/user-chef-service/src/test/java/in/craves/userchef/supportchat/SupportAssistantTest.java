package in.craves.userchef.supportchat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.support.SupportCaseStatus;
import in.craves.userchef.supportchat.SupportChatController.ChatMessage;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCasePageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class SupportAssistantTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final UUID ORDER = UUID.fromString("7d1c9a52-1f0e-4f3a-9a49-2a3b0c3d4e5f");
    private static final CurrentUser CUSTOMER =
        new CurrentUser(UUID.randomUUID(), "firebase-uid", "+919999999999", List.of("CUSTOMER"));

    private final FakeClaude claude = new FakeClaude();
    private final FakeOrders orders = new FakeOrders();
    private final FakeCases cases = new FakeCases();
    private final SupportAssistant assistant = new SupportAssistant(claude, orders, cases, JSON, () -> 0L);

    @Test
    void looksUpTheOrderWithTheCallersTokenAndAnswers() throws Exception {
        orders.known = ORDER;
        claude.reply(toolUse("t1", "get_order_details", "{\"order_id\":\"" + ORDER + "\"}"));
        claude.reply(text("Your Pesarattu is out for delivery."));

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, chat("where is my order?"));

        assertEquals("Your Pesarattu is out for delivery.", response.reply());
        assertNull(response.supportCase());
        assertEquals(List.of("Bearer caller"), orders.bearers);
        JsonNode toolResult = claude.sent.get(1).path("messages").get(2).path("content").get(0);
        assertEquals("t1", toolResult.path("tool_use_id").asText());
        assertTrue(toolResult.path("content").asText().contains("OUT_FOR_DELIVERY"));
        assertFalse(toolResult.has("is_error"));
    }

    @Test
    void ticketForSomeoneElsesOrderIsRefusedAndNothingIsCreated() throws Exception {
        claude.reply(toolUse("t1", "create_support_ticket",
            "{\"subject\":\"Refund\",\"details\":\"Wants a refund\",\"order_id\":\"" + ORDER + "\"}"));
        claude.reply(text("I couldn't find that order on your account."));

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, chat("refund order " + ORDER));

        assertNull(response.supportCase());
        assertTrue(cases.created.isEmpty());
        JsonNode toolResult = claude.sent.get(1).path("messages").get(2).path("content").get(0);
        assertTrue(toolResult.path("is_error").asBoolean());
    }

    @Test
    void opensOneTicketWithTheUsersWordsAndMasksCardNumbers() throws Exception {
        orders.known = ORDER;
        String create = "{\"subject\":\"Cold food\",\"details\":\"Food arrived cold\",\"order_id\":\"" + ORDER + "\"}";
        claude.reply(toolUse("t1", "create_support_ticket", create), toolUse("t2", "create_support_ticket", create));
        claude.reply(text("Done."));

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", ORDER,
            chat("food was cold, my card is 4111 1111 1111 1111, yes open a ticket"));

        assertEquals("CR-TEST", response.supportCase().caseNumber());
        assertEquals(1, cases.created.size());
        CreateSupportCaseRequest request = cases.created.get(0);
        assertEquals("CUSTOMER", request.contextRole());
        assertEquals(ORDER, request.orderId());
        assertTrue(request.message().startsWith(SupportAssistant.TICKET_PREFIX + "Food arrived cold"));
        assertTrue(request.message().contains("food was cold"));
        assertFalse(request.message().contains("4111"));
        assertFalse(claude.sent.get(0).toString().contains("4111"));
        JsonNode second = claude.sent.get(1).path("messages").get(2).path("content").get(1);
        assertTrue(second.path("is_error").asBoolean());
    }

    @Test
    void lastRoundForbidsToolsAndAnEmptyAnswerFallsBack() throws Exception {
        for (int i = 0; i < SupportAssistant.MAX_ROUNDS; i++) {
            claude.reply(toolUse("t" + i, "get_my_recent_orders", "{}"));
        }

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, chat("hi"));

        assertEquals(SupportAssistant.FALLBACK, response.reply());
        assertEquals(SupportAssistant.MAX_ROUNDS, claude.sent.size());
        assertEquals("auto", claude.sent.get(0).path("tool_choice").path("type").asText());
        assertEquals("none", claude.sent.get(SupportAssistant.MAX_ROUNDS - 1).path("tool_choice").path("type").asText());
    }

    @Test
    void sendsOnlyThePublicGuideTheUsersChatAndRole() throws Exception {
        claude.reply(text("Hello!"));

        assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", ORDER, List.of(
            new ChatMessage("assistant", "earlier reply cut off by the client"),
            new ChatMessage("user", "hello")));

        JsonNode sent = claude.sent.get(0);
        assertEquals(1, sent.path("messages").size());
        assertEquals("user", sent.path("messages").get(0).path("role").asText());
        assertTrue(sent.path("system").get(0).path("text").asText().startsWith("You are the Craves support assistant"));
        assertEquals("ephemeral", sent.path("system").get(0).path("cache_control").path("type").asText());
        assertTrue(sent.path("system").get(1).path("text").asText().contains(ORDER.toString()));
        assertTrue(sent.path("system").get(1).path("text").asText().contains("Craves website"));
        assertTrue(sent.path("system").get(0).path("text").asText().contains("https://craves.in/addresses"));
        assertFalse(sent.path("system").get(0).path("text").asText().contains("/admin"));
        assertFalse(sent.toString().contains("+919999999999"));
        assertFalse(sent.toString().contains(CUSTOMER.identityId().toString()));
    }

    @Test
    void modelOutageAfterATicketStillReportsTheTicket() throws Exception {
        claude.reply(toolUse("t1", "create_support_ticket", "{\"subject\":\"Help\",\"details\":\"Call me\"}"));
        claude.failNext = true;

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, chat("please open a ticket"));

        assertEquals("CR-TEST", response.supportCase().caseNumber());
        assertTrue(response.reply().contains("CR-TEST"));
    }

    @Test
    void aRecentTicketBlocksADuplicate() throws Exception {
        cases.existing.add(new SupportCaseSummaryResponse(UUID.randomUUID(), "CR-EARLIER", CUSTOMER.identityId(),
            "CUSTOMER", null, "Cold food", SupportCaseStatus.OPEN, null, null, null, null, null,
            Instant.ofEpochMilli(0).minusSeconds(60), Instant.EPOCH));
        claude.reply(toolUse("t1", "create_support_ticket", "{\"subject\":\"Cold food\",\"details\":\"again\"}"));
        claude.reply(text("You already have ticket CR-EARLIER."));

        var response = assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, chat("open a ticket"));

        assertNull(response.supportCase());
        assertTrue(cases.created.isEmpty());
        assertTrue(claude.sent.get(1).toString().contains("CR-EARLIER"));
    }

    @Test
    void historyIsCappedNewestFirstAndExtraToolCallsAreSkipped() throws Exception {
        List<ChatMessage> history = new ArrayList<>();
        for (int i = 0; i < 19; i++) {
            history.add(new ChatMessage(i % 2 == 0 ? "user" : "assistant", ("m" + i + " ").repeat(400)));
        }
        history.add(new ChatMessage("user", "latest question"));
        JsonNode four = toolUse("a", "get_my_recent_orders", "{}");
        for (String id : List.of("b", "c", "d")) {
            four = toolUse(four, toolUse(id, "get_my_recent_orders", "{}"));
        }
        claude.reply(four);
        claude.reply(text("Here you go."));

        assistant.reply(CUSTOMER, "CUSTOMER", "WEB", "Bearer caller", null, history);

        JsonNode messages = claude.sent.get(0).path("messages");
        int chars = 0;
        for (JsonNode message : messages) {
            chars += message.path("content").asText().length();
        }
        assertTrue(chars <= SupportAssistant.MAX_HISTORY_CHARS, "history not capped: " + chars);
        assertEquals("latest question", messages.get(messages.size() - 1).path("content").asText());
        assertEquals("user", messages.get(0).path("role").asText());
        JsonNode results = claude.sent.get(1).path("messages").get(messages.size() + 1).path("content");
        assertEquals(4, results.size());
        assertFalse(results.get(2).has("is_error"));
        assertTrue(results.get(3).path("is_error").asBoolean());
        assertEquals(SupportAssistant.MAX_TOOL_CALLS_PER_ROUND, orders.bearers.size());
    }

    @Test
    void maskKeepsOrderIdsAndRemovesCardNumbers() {
        String masked = SupportAssistant.mask("order 12345678-1234-1234-1234-123456789012, card 4111-1111-1111-1111, call +91 98765 43210");

        assertTrue(masked.contains("12345678-1234-1234-1234-123456789012"));
        assertFalse(masked.contains("4111"));
        assertTrue(masked.contains("+91 98765 43210"));
    }

    private static List<ChatMessage> chat(String text) {
        return List.of(new ChatMessage("user", text));
    }

    private static JsonNode text(String text) {
        ObjectNode response = JSON.createObjectNode().put("stop_reason", "end_turn");
        response.putArray("content").addObject().put("type", "text").put("text", text);
        return response;
    }

    private static JsonNode toolUse(String id, String name, String input) throws Exception {
        ObjectNode response = JSON.createObjectNode().put("stop_reason", "tool_use");
        ArrayNode content = response.putArray("content");
        content.addObject().put("type", "tool_use").put("id", id).put("name", name).set("input", JSON.readTree(input));
        return response;
    }

    /** Two tool calls in one assistant turn. */
    private static JsonNode toolUse(JsonNode first, JsonNode second) {
        ObjectNode response = (ObjectNode) first.deepCopy();
        ((ArrayNode) response.get("content")).add(second.path("content").get(0));
        return response;
    }

    private static final class FakeClaude extends ClaudeMessagesClient {
        private final Deque<JsonNode> replies = new ArrayDeque<>();
        private final List<JsonNode> sent = new ArrayList<>();
        private boolean failNext;

        FakeClaude() {
            super(JSON, null, URI.create("http://127.0.0.1:9"), "fixture-key", null);
        }

        void reply(JsonNode response) {
            replies.add(response);
        }

        void reply(JsonNode first, JsonNode second) {
            replies.add(toolUse(first, second));
        }

        @Override
        public JsonNode create(ObjectNode body, Duration timeout) {
            sent.add(body.deepCopy());
            if (failNext && sent.size() > 1) {
                throw SupportAssistant.unavailable();
            }
            return replies.isEmpty() ? text("") : replies.poll();
        }
    }

    private static final class FakeOrders extends SupportOrderClient {
        private final List<String> bearers = new ArrayList<>();
        private UUID known;

        FakeOrders() {
            super(JSON, null, null, Duration.ZERO);
        }

        @Override
        public ArrayNode recentOrders(String bearer, boolean chef) {
            bearers.add(bearer);
            return JSON.createArrayNode();
        }

        @Override
        public ObjectNode order(String bearer, boolean chef, UUID orderId) {
            bearers.add(bearer);
            return orderId.equals(known)
                ? JSON.createObjectNode().put("orderId", orderId.toString()).put("status", "OUT_FOR_DELIVERY")
                : null;
        }
    }

    private static final class FakeCases extends SupportCaseService {
        private final List<CreateSupportCaseRequest> created = new ArrayList<>();
        private final List<SupportCaseSummaryResponse> existing = new ArrayList<>();

        FakeCases() {
            super(new JdbcTemplate());
        }

        @Override
        public SupportCasePageResponse listMine(CurrentUser user, int limit, String cursor, SupportCaseStatus status) {
            return new SupportCasePageResponse(existing, null, false);
        }

        @Override
        public SupportCaseDetailResponse create(CurrentUser user, CreateSupportCaseRequest request) {
            if (!created.isEmpty()) {
                throw new ApiException(500, "DUPLICATE", "test created twice");
            }
            created.add(request);
            SupportCaseSummaryResponse summary = new SupportCaseSummaryResponse(UUID.randomUUID(), "CR-TEST",
                user.identityId(), request.contextRole(), request.orderId(), request.subject(), SupportCaseStatus.OPEN,
                null, Instant.EPOCH, null, null, null, Instant.EPOCH, Instant.EPOCH);
            return new SupportCaseDetailResponse(summary, List.of(), List.of());
        }
    }
}
