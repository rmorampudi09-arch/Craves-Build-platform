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

    /**
     * Takes what the server has received so far as "CHANNEL|ROLE|title|body" lines after checking the fields every notice
     * shares. {@code wholeAccount}: only its in-app notices have the role in the request key (one per role).
     */
    List<String> drain(String event, boolean wholeAccount) {
        List<String> lines = new ArrayList<>();
        for (JsonNode post : posts) {
            String channel = post.get("channel").asText();
            String role = post.get("userRole").asText();
            String type = "ACCOUNT_DELETION_" + event.toUpperCase();
            assertEquals("account-deletion:" + requestId + ":" + event + ":" + channel
                    + (wholeAccount && channel.equals("IN_APP") ? ":" + role : ""),
                post.get("requestKey").asText());
            assertEquals("auth", post.get("sourceService").asText());
            assertEquals(type, post.get("eventType").asText());
            assertEquals(type + "_" + channel, post.get("templateCode").asText());
            assertEquals(identityId.toString(), post.get("userId").asText());
            assertEquals("ACCOUNT_DELETION", post.get("targetType").asText());
            assertEquals(requestId.toString(), post.get("targetId").asText());
            lines.add(channel + "|" + role + "|" + post.get("title").asText() + "|" + post.get("body").asText());
        }
        assertEquals(posts.size(), keys.stream().filter("notification-credential"::equals).count());
        assertEquals(posts.size(), paths.stream().filter("POST /internal/v1/notifications"::equals).count());
        posts.clear(); keys.clear(); paths.clear();
        return lines;
    }

    static List<String> inAppAndPush(String role, String title, String body) {
        return List.of("IN_APP|" + role + "|" + title + "|" + body, "PUSH|" + role + "|" + title + "|" + body);
    }

    @Test void noticesUseTheCopyTableAndNeverThrow() throws Exception {
        String scheduled = "Your Craves account will be deleted on 3 Dec. Open the app and tap Keep my account to stop it.";
        String sent = "Craves will finish it once your payouts are settled.";
        String reminder = "Your Craves account will be deleted on 3 Dec. Tap Keep my account if you want to keep it.";

        notices.requested(request(Scope.CUSTOMER, null), false);
        assertEquals(inAppAndPush("CUSTOMER", "Account deletion scheduled", scheduled), drain("requested", false));

        notices.requested(request(Scope.CHEF, null), true);
        assertEquals(inAppAndPush("CHEF", "Deletion request sent", sent), drain("requested", false));

        notices.approved(request(Scope.CHEF, null));
        assertEquals(inAppAndPush("CHEF", "Account deletion scheduled", scheduled), drain("approved", false));

        notices.rejected(request(Scope.CUSTOMER, "Please settle your payouts first."));
        assertEquals(inAppAndPush("CUSTOMER", "Deletion request not approved", "Please settle your payouts first."),
            drain("rejected", false));

        notices.reminder(request(Scope.CUSTOMER, null));
        assertEquals(inAppAndPush("CUSTOMER", "Account deletion in 7 days", reminder), drain("reminder", false));

        notices.completed(request(Scope.CUSTOMER, null), PHONE, EMAIL);
        assertEquals(List.of("IN_APP|CUSTOMER|Customer details deleted|Your customer details have been deleted. Your chef account is unchanged."),
            drain("completed", false));

        notices.completed(request(Scope.CHEF, null), PHONE, EMAIL);
        assertEquals(List.of("IN_APP|CHEF|Chef account deleted|Your chef account has been deleted. You can still order on Craves."),
            drain("completed", false));

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

    @Test void wholeAccountInAppGoesToBothRolesAndPushOnce() {
        String scheduled = "Your Craves account will be deleted on 3 Dec. Open the app and tap Keep my account to stop it.";
        String sent = "Craves will finish it once your payouts are settled.";
        String reminder = "Your Craves account will be deleted on 3 Dec. Tap Keep my account if you want to keep it.";
        String note = "Please settle your payouts first.";

        notices.requested(request(Scope.ALL, null), false);
        assertWholeAccount(drain("requested", true), "Account deletion scheduled", scheduled);
        notices.requested(request(Scope.ALL, null), true);
        assertWholeAccount(drain("requested", true), "Deletion request sent", sent);
        notices.approved(request(Scope.ALL, null));
        assertWholeAccount(drain("approved", true), "Account deletion scheduled", scheduled);
        notices.rejected(request(Scope.ALL, note));
        assertWholeAccount(drain("rejected", true), "Deletion request not approved", note);
        notices.reminder(request(Scope.ALL, null));
        assertWholeAccount(drain("reminder", true), "Account deletion in 7 days", reminder);
    }

    /**
     * In-app once per role (the inboxes are per role, so the keys differ); push once, for the customer role, because
     * the app has one push token per device for both sides.
     */
    static void assertWholeAccount(List<String> lines, String title, String body) {
        assertEquals(List.of("IN_APP|CUSTOMER|", "IN_APP|CHEF|", "PUSH|CUSTOMER|").stream().map(l -> l + title + "|" + body).toList(),
            lines);
    }

    @Test void completedAllSendsEmailOnlyWhenVerifiedAndNeverSms() {
        String body = "Your Craves account has been deleted. Thank you for using Craves.";
        notices.completed(request(Scope.ALL, null), PHONE, EMAIL);
        List<JsonNode> sent = new ArrayList<>(posts);
        assertEquals(List.of("EMAIL|CUSTOMER|Craves account deleted|" + body), drain("completed", false));
        assertEquals(EMAIL, sent.get(0).get("address").asText());

        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        var logger = (Logger) LoggerFactory.getLogger(DeletionNotices.class);
        logger.addAppender(appender);
        logger.setAdditive(false);
        try {
            notices.completed(request(Scope.ALL, null), PHONE, null);
            notices.completed(request(Scope.ALL, null), PHONE, " ");
        } finally { logger.detachAppender(appender); logger.setAdditive(true); }
        assertTrue(posts.isEmpty(), "no SMS, and no email without a verified address");
        assertEquals(2, appender.list.size());
        for (ILoggingEvent event : appender.list) {
            assertEquals(ch.qos.logback.classic.Level.INFO, event.getLevel());
            assertTrue(event.getFormattedMessage().contains(requestId.toString()), event.getFormattedMessage());
            assertFalse(event.getFormattedMessage().contains(PHONE), event.getFormattedMessage());
        }
    }

    static int closedPort() throws Exception {
        try (var socket = new ServerSocket(0, 0, InetAddress.getLoopbackAddress())) { return socket.getLocalPort(); }
    }
}
