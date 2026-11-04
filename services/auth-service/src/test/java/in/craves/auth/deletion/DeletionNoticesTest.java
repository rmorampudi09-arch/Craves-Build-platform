package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.*;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class DeletionNoticesTest {
    static final String PHONE = "+919876543210";
    static final String EMAIL = "someone@example.test";
    // 3 Dec 00:30 in Asia/Kolkata, still 2 Dec in UTC.
    static final Instant DUE = Instant.parse("2026-12-02T19:00:00Z");

    final ObjectMapper mapper = new ObjectMapper();
    final UUID requestId = UUID.randomUUID();
    final UUID identityId = UUID.randomUUID();
    final List<JsonNode> posts = new CopyOnWriteArrayList<>();
    final List<String> keys = new CopyOnWriteArrayList<>();
    final List<String> paths = new CopyOnWriteArrayList<>();
    volatile int status = 202;
    HttpServer server;
    DeletionNotices notices;

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            paths.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            keys.add(exchange.getRequestHeaders().getFirst("X-Craves-Internal-Key"));
            posts.add(mapper.readTree(exchange.getRequestBody().readAllBytes()));
            byte[] bytes = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        notices = new DeletionNotices(props("http://127.0.0.1:" + server.getAddress().getPort()));
    }

    @AfterEach void stop() { server.stop(0); }

    AccountDeletionProperties props(String notificationBase) {
        var props = new AccountDeletionProperties();
        var service = new AccountDeletionProperties.Service();
        service.setBaseUrl(notificationBase);
        service.setCredential("notification-credential");
        props.setServices(Map.of("notification", service));
        props.setCallTimeout(Duration.ofSeconds(5));
        return props;
    }

    DeletionRequest request(Scope scope, String reviewNote) {
        return new DeletionRequest(requestId, identityId, scope, RequestStatus.SCHEDULED, Via.APP,
            Instant.parse("2026-11-03T10:00:00Z"), DUE, null, null, reviewNote, null, null, null, null, null, null, null);
    }

    /** Takes what the server has received so far as "CHANNEL|title|body" lines after checking the fields every notice shares. */
    List<String> drain(String event, String role) {
        List<String> lines = new ArrayList<>();
        for (JsonNode post : posts) {
            String channel = post.get("channel").asText();
            String type = "ACCOUNT_DELETION_" + event.toUpperCase();
            assertEquals("account-deletion:" + requestId + ":" + event + ":" + channel, post.get("requestKey").asText());
            assertEquals("auth", post.get("sourceService").asText());
            assertEquals(type, post.get("eventType").asText());
            assertEquals(type + "_" + channel, post.get("templateCode").asText());
            assertEquals(identityId.toString(), post.get("userId").asText());
            assertEquals(role, post.get("userRole").asText());
            assertEquals("ACCOUNT_DELETION", post.get("targetType").asText());
            assertEquals(requestId.toString(), post.get("targetId").asText());
            lines.add(channel + "|" + post.get("title").asText() + "|" + post.get("body").asText());
        }
        assertEquals(posts.size(), keys.stream().filter("notification-credential"::equals).count());
        assertEquals(posts.size(), paths.stream().filter("POST /internal/v1/notifications"::equals).count());
        posts.clear(); keys.clear(); paths.clear();
        return lines;
    }

    @Test void noticesUseTheCopyTableAndNeverThrow() throws Exception {
        String scheduled = "Your Craves account will be deleted on 3 Dec. Open the app and tap Keep my account to stop it.";

        notices.requested(request(Scope.CUSTOMER, null), false);
        assertEquals(List.of("IN_APP|Account deletion scheduled|" + scheduled, "PUSH|Account deletion scheduled|" + scheduled),
            drain("requested", "CUSTOMER"));

        notices.requested(request(Scope.CHEF, null), true);
        String sent = "Craves will finish it once your payouts are settled.";
        assertEquals(List.of("IN_APP|Deletion request sent|" + sent, "PUSH|Deletion request sent|" + sent),
            drain("requested", "CHEF"));

        notices.approved(request(Scope.CHEF, null));
        assertEquals(List.of("IN_APP|Account deletion scheduled|" + scheduled, "PUSH|Account deletion scheduled|" + scheduled),
            drain("approved", "CHEF"));

        notices.rejected(request(Scope.ALL, "Please settle your payouts first."));
        assertEquals(List.of("IN_APP|Deletion request not approved|Please settle your payouts first.",
            "PUSH|Deletion request not approved|Please settle your payouts first."), drain("rejected", "CUSTOMER"));

        notices.reminder(request(Scope.CUSTOMER, null));
        String reminder = "Your Craves account will be deleted on 3 Dec. Tap Keep my account if you want to keep it.";
        assertEquals(List.of("IN_APP|Account deletion in 7 days|" + reminder, "PUSH|Account deletion in 7 days|" + reminder),
            drain("reminder", "CUSTOMER"));

        notices.completed(request(Scope.CUSTOMER, null), PHONE, EMAIL);
        assertEquals(List.of("IN_APP|Customer details deleted|Your customer details have been deleted. Your chef account is unchanged."),
            drain("completed", "CUSTOMER"));

        notices.completed(request(Scope.CHEF, null), PHONE, EMAIL);
        assertEquals(List.of("IN_APP|Chef account deleted|Your chef account has been deleted. You can still order on Craves."),
            drain("completed", "CHEF"));

        // A refused, unreachable or unconfigured notification service never reaches the caller,
        // and what is logged holds the request id but no contact details.
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        var logger = (Logger) LoggerFactory.getLogger(DeletionNotices.class);
        logger.addAppender(appender);
        logger.setAdditive(false); // keep the expected warnings out of the test output
        var down = new DeletionNotices(props("http://127.0.0.1:" + closedPort()));
        var unconfigured = new DeletionNotices(new AccountDeletionProperties());
        var noDueDate = new DeletionRequest(requestId, identityId, Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.APP,
            Instant.parse("2026-11-03T10:00:00Z"), null, null, null, null, null, null, null, null, null, null, null);
        try {
            status = 500;
            assertDoesNotThrow(() -> notices.completed(request(Scope.ALL, null), PHONE, EMAIL));
            assertDoesNotThrow(() -> down.completed(request(Scope.ALL, null), PHONE, EMAIL));
            assertDoesNotThrow(() -> down.requested(request(Scope.CUSTOMER, null), false));
            assertDoesNotThrow(() -> unconfigured.reminder(request(Scope.CUSTOMER, null)));
            assertDoesNotThrow(() -> notices.approved(noDueDate));
        } finally { logger.detachAppender(appender); logger.setAdditive(true); }
        assertFalse(appender.list.isEmpty());
        for (ILoggingEvent event : appender.list) {
            String text = event.getFormattedMessage();
            assertTrue(text.contains(requestId.toString()), text);
            assertFalse(text.contains(PHONE) || text.contains(EMAIL), text);
            assertNull(event.getThrowableProxy(), text);
        }
    }

    @Test void completedAllSendsSmsAndEmailOnlyWhenVerified() {
        String body = "Your Craves account has been deleted. Thank you for using Craves.";
        notices.completed(request(Scope.ALL, null), PHONE, EMAIL);
        List<JsonNode> both = new ArrayList<>(posts);
        assertEquals(List.of("SMS|Craves account deleted|" + body, "EMAIL|Craves account deleted|" + body),
            drain("completed", "CUSTOMER"));
        assertEquals(PHONE, both.get(0).get("address").asText());
        assertEquals(EMAIL, both.get(1).get("address").asText());

        notices.completed(request(Scope.ALL, null), PHONE, null);
        assertEquals(List.of("SMS|Craves account deleted|" + body), drain("completed", "CUSTOMER"));
    }

    static int closedPort() throws Exception {
        try (var socket = new ServerSocket(0, 0, InetAddress.getLoopbackAddress())) { return socket.getLocalPort(); }
    }
}
