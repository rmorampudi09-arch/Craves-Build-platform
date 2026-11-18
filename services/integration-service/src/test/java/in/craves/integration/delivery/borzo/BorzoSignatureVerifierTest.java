package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import in.craves.integration.config.BorzoProperties;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class BorzoSignatureVerifierTest {

    @Test
    void validatesOfficialHexHmacSha256Shape() {
        BorzoProperties properties = new BorzoProperties();
        properties.setCallbackSecret("test-secret");
        BorzoSignatureVerifier verifier = new BorzoSignatureVerifier(properties);

        String body = "{\"event_type\":\"delivery_changed\"}";
        String signature = "299a28b35885681ec91420b8b3420f875b4a564cf7c836acc2d3e37639e4e8b9";

        assertThat(verifier.isValid(body, signature)).isTrue();
        assertThat(verifier.isValid(body + " ", signature)).isFalse();
        assertThat(verifier.isValid(body, "deadbeef")).isFalse();
    }

    @Test
    void rejectsCallbacksWhenSecretIsMissing() {
        BorzoSignatureVerifier verifier = new BorzoSignatureVerifier(new BorzoProperties());

        assertThat(verifier.isConfigured()).isFalse();
        assertThat(verifier.isValid("{}", "abc")).isFalse();
    }

    @Test
    void previousSecretIsIgnoredUntilSetThenAcceptedAndCounted() {
        BorzoProperties properties = new BorzoProperties();
        properties.setCallbackSecret("test-secret-b");
        BorzoSignatureVerifier verifier = new BorzoSignatureVerifier(properties);
        String body = "{\"event_type\":\"delivery_changed\"}";
        String withOld = BorzoSignatureVerifier.hmacSha256Hex(body, "test-secret-a");
        String withNew = BorzoSignatureVerifier.hmacSha256Hex(body, "test-secret-b");

        List<String> lines = new CopyOnWriteArrayList<>();
        AppenderBase<ILoggingEvent> appender = new AppenderBase<>() {
            @Override
            protected void append(ILoggingEvent event) {
                lines.add(event.getFormattedMessage());
            }
        };
        Logger logger = (Logger) LoggerFactory.getLogger(BorzoSignatureVerifier.class);
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat(verifier.isValid(body, withOld)).isFalse();
            properties.setCallbackSecretPrevious("  ");
            assertThat(verifier.isValid(body, withOld)).isFalse();
            assertThat(verifier.isValid(body, BorzoSignatureVerifier.hmacSha256Hex(body, "  "))).isFalse();

            properties.setCallbackSecretPrevious("test-secret-a");
            assertThat(verifier.isValid(body, withNew)).isTrue();
            assertThat(lines).isEmpty();
            assertThat(verifier.isValid(body, withOld)).isTrue();
            assertThat(verifier.isValid(body + " ", withOld)).isFalse();
            assertThat(verifier.isValid(body, BorzoSignatureVerifier.hmacSha256Hex(body, "test-secret-c"))).isFalse();
            assertThat(lines).containsExactly("COURIER_WEBHOOK_PREVIOUS_SECRET_USED provider=borzo");

            properties.setCallbackSecret("");
            assertThat(verifier.isConfigured()).isFalse();
            assertThat(verifier.isValid(body, withOld)).isFalse();
        } finally {
            logger.detachAppender(appender);
        }
    }
}
