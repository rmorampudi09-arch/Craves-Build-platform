package in.craves.notification.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import in.craves.notification.delivery.RealtimePushSender.Push;
import in.craves.notification.delivery.RealtimePushSender.Result;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Fake FCM: the FirebaseMessaging call is mocked and the sent Message is read field by field. */
class RealtimePushSenderTest {
    private final FirebaseMessaging fcm = mock(FirebaseMessaging.class);
    private final TestClock clock = new TestClock();
    private final RealtimePushSender sender = new RealtimePushSender(fcm, clock);
    private final Push offer = new Push(
        "rider", "rider-token-1", Map.of("type", "OFFER", "offerId", "offer-7", "expiresAt", "2026-10-20T10:00:40Z"),
        "New order", "Rs 62 for 3.1 km", 40, "rider_offer"
    );

    @Test
    void sendsOneHighPriorityDataMessageThatLivesOnlyAsLongAsTheOffer() throws Exception {
        when(fcm.send(any(Message.class))).thenReturn("projects/craves/messages/1");

        assertThat(sender.send(offer)).isEqualTo(new Result("projects/craves/messages/1", null));

        JsonNode sent = sent(1)[0];
        assertThat(sent.at("/token").asText()).isEqualTo("rider-token-1");
        assertThat(sent.at("/androidConfig/priority").asText()).isEqualTo("high");
        assertThat(sent.at("/androidConfig/ttl").asText()).isEqualTo("40s");
        assertThat(sent.at("/androidConfig/collapseKey").asText()).isEqualTo("rider_offer");
        assertThat(sent.at("/androidConfig/restrictedPackageName").asText()).isEqualTo("com.cravesapp.rider");
        assertThat(sent.at("/data/type").asText()).isEqualTo("OFFER");
        assertThat(sent.at("/data/offerId").asText()).isEqualTo("offer-7");
        assertThat(sent.at("/data/expiresAt").asText()).isEqualTo("2026-10-20T10:00:40Z");
        // The visible notification text travels in data; the app posts it on rider_offers and rings.
        assertThat(sent.at("/data/title").asText()).isEqualTo("New order");
        assertThat(sent.at("/data/body").asText()).isEqualTo("Rs 62 for 3.1 km");
        assertThat(sent.get("notification").isNull()).isTrue();
        assertThat(sent.at("/androidConfig/notification").isNull()).isTrue();
    }

    @Test
    void retriesOnceOnATransientErrorWithTheSecondsThatAreLeft() throws Exception {
        FirebaseMessagingException unavailable = fcmError(MessagingErrorCode.UNAVAILABLE);
        when(fcm.send(any(Message.class)))
            .thenAnswer(call -> {
                clock.advance(5_000);
                throw unavailable;
            })
            .thenReturn("projects/craves/messages/2");

        assertThat(sender.send(offer)).isEqualTo(new Result("projects/craves/messages/2", null));

        JsonNode[] sent = sent(2);
        assertThat(sent[0].at("/androidConfig/ttl").asText()).isEqualTo("40s");
        assertThat(sent[1].at("/androidConfig/ttl").asText()).isEqualTo("35s");
    }

    @Test
    void neverRetriesAfterTheOfferHasExpired() throws Exception {
        FirebaseMessagingException unavailable = fcmError(MessagingErrorCode.INTERNAL);
        when(fcm.send(any(Message.class))).thenAnswer(call -> {
            clock.advance(40_000);
            throw unavailable;
        });

        assertThat(sender.send(offer)).isEqualTo(new Result(null, "FCM_UNAVAILABLE"));
        verify(fcm, times(1)).send(any(Message.class));
    }

    @Test
    void retriesOnlyOnceEvenWhenTimeIsLeft() throws Exception {
        FirebaseMessagingException unavailable = fcmError(MessagingErrorCode.UNAVAILABLE);
        when(fcm.send(any(Message.class))).thenThrow(unavailable);

        assertThat(sender.send(offer)).isEqualTo(new Result(null, "FCM_UNAVAILABLE"));
        verify(fcm, times(2)).send(any(Message.class));
    }

    @Test
    void tokenErrorsAreNotRetriedAndTellTheCallerToMarkTheDevice() throws Exception {
        doThrow(fcmError(MessagingErrorCode.UNREGISTERED)).when(fcm).send(any(Message.class));
        assertThat(sender.send(offer)).isEqualTo(new Result(null, "TOKEN_UNREGISTERED"));

        doThrow(fcmError(MessagingErrorCode.INVALID_ARGUMENT)).when(fcm).send(any(Message.class));
        assertThat(sender.send(offer)).isEqualTo(new Result(null, "TOKEN_INVALID"));

        verify(fcm, times(2)).send(any(Message.class));
    }

    @Test
    void aSendStillRunningWhenTheOfferExpiresIsAbandoned() throws Exception {
        when(fcm.send(any(Message.class))).thenAnswer(call -> {
            Thread.sleep(10_000);
            return "too-late";
        });
        Push lastSecond = new Push("rider", "rider-token-1", Map.of("type", "OFFER"), "New order", "Rs 62", 1, null);

        long started = System.nanoTime();
        assertThat(sender.send(lastSecond)).isEqualTo(new Result(null, "EXPIRED"));

        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(5_000);
        verify(fcm, times(1)).send(any(Message.class));
    }

    private JsonNode[] sent(int count) throws Exception {
        ArgumentCaptor<Message> messages = ArgumentCaptor.forClass(Message.class);
        verify(fcm, times(count)).send(messages.capture());
        // Message exposes no public getters; read its fields the way the SDK serialises them.
        ObjectMapper fields = new ObjectMapper()
            .setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.NONE)
            .setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);
        return messages.getAllValues().stream().map(fields::<JsonNode>valueToTree).toArray(JsonNode[]::new);
    }

    private static FirebaseMessagingException fcmError(MessagingErrorCode code) {
        FirebaseMessagingException exception = mock(FirebaseMessagingException.class);
        when(exception.getMessagingErrorCode()).thenReturn(code);
        return exception;
    }

    private static final class TestClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-20T10:00:00Z");

        void advance(long millis) {
            now = now.plusMillis(millis);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
