package in.craves.userchef.supportchat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.supportchat.SupportChatController.ChatMessage;
import in.craves.userchef.supportchat.SupportChatController.SupportCaseRef;
import in.craves.userchef.supportchat.SupportChatController.SupportChatResponse;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseMessageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Runs one support-chat turn: Claude with four tools, all scoped to the signed-in caller.
 * Nothing reaches the model that the caller could not already see: the public guide, their own
 * chat, their own orders (via order-service with their own token) and their own tickets.
 */
@Service
public class SupportAssistant {
    static final int MAX_ROUNDS = 4;
    static final int MAX_TOOL_CALLS_PER_ROUND = 3;
    // Every round re-sends the history, so it is capped to bound cost; older turns are dropped first.
    static final int MAX_HISTORY_CHARS = 8000;
    static final Duration TICKET_COOLDOWN = Duration.ofMinutes(10);
    static final String TICKET_PREFIX = "[Opened by Craves support assistant]\n";
    static final String FALLBACK = "Sorry, I couldn't finish that just now. Please try again, "
        + "or email support@craves.in with your order reference.";
    private static final Duration BUDGET = Duration.ofSeconds(35);
    private static final Duration MAX_CALL = Duration.ofSeconds(20);
    private static final Duration MIN_CALL = Duration.ofSeconds(4);
    private static final int MAX_TOKENS = 700;
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    // Card-number-length digit runs (13+) are masked before the model or a ticket sees them; phone numbers
    // survive, and order ids (UUIDs) are matched first so their digits are never mistaken for a card.
    private static final Pattern UUID_OR_LONG_NUMBER = Pattern.compile(
        "(\\b\\p{XDigit}{8}-\\p{XDigit}{4}-\\p{XDigit}{4}-\\p{XDigit}{4}-\\p{XDigit}{12}\\b)|\\d(?:[ -]?\\d){12,}");
    private static final String TOOLS = """
        [
          {"name": "get_my_recent_orders",
           "description": "List the signed-in user's 10 most recent orders, newest first, with status and total.",
           "input_schema": {"type": "object", "properties": {}, "additionalProperties": false}},
          {"name": "get_order_details",
           "description": "Get one of the signed-in user's own orders: items, charges, status and, for customers, delivery status.",
           "input_schema": {"type": "object", "additionalProperties": false, "required": ["order_id"],
             "properties": {"order_id": {"type": "string", "description": "Order id (UUID) from get_my_recent_orders or the chat context"}}}},
          {"name": "get_my_support_tickets",
           "description": "List the signed-in user's 5 most recent support tickets with status and the latest reply from the Craves support team.",
           "input_schema": {"type": "object", "properties": {}, "additionalProperties": false}},
          {"name": "create_support_ticket",
           "description": "Open a ticket for the Craves support team. Only call this after the user agreed to it. At most once per conversation.",
           "input_schema": {"type": "object", "additionalProperties": false, "required": ["subject", "details"],
             "properties": {
               "subject": {"type": "string", "description": "Short subject, at most 120 characters"},
               "details": {"type": "string", "description": "What happened and what the user wants, at most 2000 characters. Never include OTPs, card numbers or passwords."},
               "order_id": {"type": "string", "description": "Order id (UUID) when the issue is about one order"}}}}
        ]
        """;

    private final ClaudeMessagesClient claude;
    private final SupportOrderClient orders;
    private final SupportCaseService supportCases;
    private final ObjectMapper objectMapper;
    private final LongSupplier clock;
    private final String guide;
    private final JsonNode tools;

    @Autowired
    public SupportAssistant(
        ClaudeMessagesClient claude,
        SupportOrderClient orders,
        SupportCaseService supportCases,
        ObjectMapper objectMapper
    ) {
        this(claude, orders, supportCases, objectMapper, System::currentTimeMillis);
    }

    SupportAssistant(
        ClaudeMessagesClient claude,
        SupportOrderClient orders,
        SupportCaseService supportCases,
        ObjectMapper objectMapper,
        LongSupplier clock
    ) {
        this.claude = claude;
        this.orders = orders;
        this.supportCases = supportCases;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.guide = loadGuide();
        try {
            this.tools = objectMapper.readTree(TOOLS);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Support assistant tool definitions are invalid", exception);
        }
    }

    public boolean available() {
        return claude.configured();
    }

    /** One reply for the chat so far; {@code history} is already validated by the controller. */
    public SupportChatResponse reply(
        CurrentUser user,
        String role,
        String channel,
        String bearer,
        UUID contextOrderId,
        List<ChatMessage> history
    ) {
        Turn turn = new Turn(user, role, bearer, history);
        ArrayNode conversation = objectMapper.createArrayNode();
        int start = history.size() - 1; // The latest user message is always kept.
        int chars = history.get(start).content().length();
        while (start > 0 && chars + history.get(start - 1).content().length() <= MAX_HISTORY_CHARS) {
            chars += history.get(--start).content().length();
        }
        for (ChatMessage message : history.subList(start, history.size())) {
            if (conversation.isEmpty() && !"user".equals(message.role())) {
                continue; // A trimmed client history can start mid-conversation; the API needs a user turn first.
            }
            conversation.addObject().put("role", message.role()).put("content", mask(message.content()));
        }
        long deadline = clock.getAsLong() + BUDGET.toMillis();
        for (int round = 1; round <= MAX_ROUNDS; round++) {
            long left = deadline - clock.getAsLong();
            if (left < MIN_CALL.toMillis()) {
                break;
            }
            JsonNode response;
            try {
                response = claude.create(request(role, channel, contextOrderId, conversation, round == MAX_ROUNDS),
                    Duration.ofMillis(Math.min(left, MAX_CALL.toMillis())));
            } catch (ApiException exception) {
                if (turn.ticket == null) {
                    throw exception;
                }
                return new SupportChatResponse(ticketOpened(turn.ticket), turn.ticket);
            }
            JsonNode content = response.path("content");
            if (!"tool_use".equals(response.path("stop_reason").asText()) || round == MAX_ROUNDS) {
                String text = text(content);
                if (!text.isEmpty()) {
                    return new SupportChatResponse(text, turn.ticket);
                }
                break;
            }
            // The assistant turn goes back unchanged (it may hold thinking blocks), followed by the tool results.
            conversation.addObject().put("role", "assistant").set("content", content);
            ArrayNode results = conversation.addObject().put("role", "user").putArray("content");
            int calls = 0;
            for (JsonNode block : content) {
                if (!"tool_use".equals(block.path("type").asText())) {
                    continue;
                }
                // Every tool_use needs a result; extra or late calls get a skip so the reply stays within budget.
                boolean skip = ++calls > MAX_TOOL_CALLS_PER_ROUND || deadline - clock.getAsLong() < MIN_CALL.toMillis();
                results.add(skip
                    ? objectMapper.createObjectNode().put("type", "tool_result")
                        .put("tool_use_id", block.path("id").asText())
                        .put("content", "Skipped: out of time for more lookups. Answer with what you have.")
                        .put("is_error", true)
                    : runTool(turn, block));
            }
        }
        return new SupportChatResponse(turn.ticket == null ? FALLBACK : ticketOpened(turn.ticket), turn.ticket);
    }

    private ObjectNode request(String role, String channel, UUID contextOrderId, ArrayNode conversation, boolean lastRound) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("max_tokens", MAX_TOKENS);
        ArrayNode system = body.putArray("system");
        // Tools plus the static guide form a stable prefix, so it is cached across turns and users.
        system.addObject().put("type", "text").put("text", guide)
            .putObject("cache_control").put("type", "ephemeral");
        system.addObject().put("type", "text").put("text", "Signed-in user role: " + role
            + ". " + switch (channel == null ? "" : channel) {
                case "WEB" -> "The user is chatting on the Craves website (craves.in).";
                case "APP" -> "The user is chatting in the Craves mobile app.";
                default -> "It is not known whether the user is on the website or the app; if steps differ, give both briefly.";
            }
            + " Today is " + LocalDate.now(IST) + " (India time)."
            + (contextOrderId == null ? "" : " The user opened this chat from order " + contextOrderId + "."));
        body.set("tools", tools);
        // On the last round the model must answer in text instead of asking for another tool.
        body.putObject("tool_choice").put("type", lastRound ? "none" : "auto");
        body.set("messages", conversation);
        return body;
    }

    private ObjectNode runTool(Turn turn, JsonNode call) {
        ObjectNode result = objectMapper.createObjectNode()
            .put("type", "tool_result")
            .put("tool_use_id", call.path("id").asText());
        JsonNode input = call.path("input");
        boolean chef = "CHEF".equals(turn.role);
        try {
            JsonNode output = switch (call.path("name").asText()) {
                case "get_my_recent_orders" -> orders.recentOrders(turn.bearer, chef);
                case "get_order_details" -> {
                    UUID orderId = uuid(input.path("order_id").asText(""));
                    ObjectNode order = orderId == null ? null : orders.order(turn.bearer, chef, orderId);
                    if (order == null) {
                        throw new ToolError("No order with that id on this account.");
                    }
                    yield order;
                }
                case "get_my_support_tickets" -> tickets(turn.user);
                case "create_support_ticket" -> createTicket(turn, input, chef);
                default -> throw new ToolError("Unknown tool.");
            };
            return result.put("content", objectMapper.writeValueAsString(output));
        } catch (ToolError | ApiException exception) {
            // ApiException messages in this service are already written for end users.
            return result.put("content", exception.getMessage()).put("is_error", true);
        } catch (JsonProcessingException exception) {
            return result.put("content", "Lookup failed.").put("is_error", true);
        }
    }

    private ArrayNode tickets(CurrentUser user) {
        ArrayNode tickets = objectMapper.createArrayNode();
        for (SupportCaseSummaryResponse summary : supportCases.listMine(user, 5, null, null).cases()) {
            ObjectNode ticket = tickets.addObject()
                .put("ticket", summary.caseNumber())
                .put("subject", summary.subject())
                .put("status", summary.status().name())
                .put("updatedAt", String.valueOf(summary.updatedAt()));
            if (summary.orderId() != null) {
                ticket.put("orderId", summary.orderId().toString());
            }
            List<SupportCaseMessageResponse> messages = supportCases.getMine(user, summary.id()).messages();
            for (int i = messages.size() - 1; i >= 0; i--) {
                SupportCaseMessageResponse message = messages.get(i);
                if (!"CUSTOMER".equals(message.senderRole()) && !"CHEF".equals(message.senderRole())) {
                    ticket.put("latestSupportReply", clip(message.body(), 1000));
                    break;
                }
            }
        }
        return tickets;
    }

    private ObjectNode createTicket(Turn turn, JsonNode input, boolean chef) {
        if (turn.ticket != null) {
            throw new ToolError("Ticket " + turn.ticket.caseNumber() + " is already open for this conversation.");
        }
        String subject = clip(mask(input.path("subject").asText("")), 120);
        String details = clip(mask(input.path("details").asText("")), 2000);
        if (subject.isEmpty() || details.isEmpty()) {
            throw new ToolError("subject and details are required.");
        }
        // Also stops duplicates when a client timed out and the user resends the same request.
        Instant recent = Instant.ofEpochMilli(clock.getAsLong()).minus(TICKET_COOLDOWN);
        for (SupportCaseSummaryResponse existing : supportCases.listMine(turn.user, 5, null, null).cases()) {
            if (existing.createdAt() != null && existing.createdAt().isAfter(recent)) {
                throw new ToolError("Ticket " + existing.caseNumber()
                    + " was opened a few minutes ago; the support team will follow up there.");
            }
        }
        UUID orderId = null;
        String rawOrderId = input.path("order_id").asText("");
        if (!rawOrderId.isBlank()) {
            orderId = uuid(rawOrderId);
            if (orderId == null || orders.order(turn.bearer, chef, orderId) == null) {
                // support_case.order_id is reference-only, so ownership is checked here.
                throw new ToolError("No order with that id on this account.");
            }
        }
        var created = supportCases.create(turn.user,
            new CreateSupportCaseRequest(turn.role, orderId, subject, TICKET_PREFIX + details + userWords(turn.history)));
        turn.ticket = new SupportCaseRef(created.supportCase().id(), created.supportCase().caseNumber());
        return objectMapper.createObjectNode().put("ticket", turn.ticket.caseNumber()).put("status", "OPEN");
    }

    /** The requester's own recent messages, so the team sees their words, not only the model's summary. */
    private static String userWords(List<ChatMessage> history) {
        List<ChatMessage> fromUser = history.stream().filter(message -> "user".equals(message.role())).toList();
        StringBuilder words = new StringBuilder("\n\nRequester's messages in the chat:");
        for (ChatMessage message : fromUser.subList(Math.max(0, fromUser.size() - 5), fromUser.size())) {
            words.append("\n- ").append(clip(mask(message.content()), 400));
        }
        return words.toString();
    }

    private static String ticketOpened(SupportCaseRef ticket) {
        return "I've opened ticket " + ticket.caseNumber()
            + " for the Craves support team. They'll reply in your notifications.";
    }

    private static String text(JsonNode content) {
        StringBuilder text = new StringBuilder();
        for (JsonNode block : content) {
            if ("text".equals(block.path("type").asText())) {
                text.append(block.path("text").asText());
            }
        }
        return text.toString().trim();
    }

    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    static String mask(String value) {
        return UUID_OR_LONG_NUMBER.matcher(value)
            .replaceAll(match -> match.group(1) != null ? match.group(1) : "[number removed]");
    }

    private static String clip(String value, int max) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private static String loadGuide() {
        try (InputStream in = SupportAssistant.class.getResourceAsStream("/support-assistant/guide.md")) {
            if (in == null) {
                throw new IllegalStateException("support-assistant/guide.md is missing from the classpath");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    static ApiException unavailable() {
        return new ApiException(503, "SUPPORT_CHAT_UNAVAILABLE",
            "The support assistant is unavailable right now. Please email support@craves.in.");
    }

    /** Per-request state: who is asking and the ticket opened so far. */
    private static final class Turn {
        private final CurrentUser user;
        private final String role;
        private final String bearer;
        private final List<ChatMessage> history;
        private SupportCaseRef ticket;

        private Turn(CurrentUser user, String role, String bearer, List<ChatMessage> history) {
            this.user = user;
            this.role = role;
            this.bearer = bearer;
            this.history = history;
        }
    }

    private static final class ToolError extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private ToolError(String message) {
            super(message, null, false, false);
        }
    }
}
