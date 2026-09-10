package in.craves.supportassistant.safety;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SensitiveDataRedactorTest {
    private final SensitiveDataRedactor redactor = new SensitiveDataRedactor();

    @Test
    void removesCredentialsOtpPaymentAndDirectContactDataBeforeModelUse() {
        String input = "OTP: 123456 password=hunter2 bearer abc.def.ghi email me at test@example.com "
            + "or +91 9876543210 card 4111111111111111";

        String safe = redactor.redactForModel(input);

        assertThat(safe)
            .doesNotContain("123456")
            .doesNotContain("hunter2")
            .doesNotContain("abc.def.ghi")
            .doesNotContain("test@example.com")
            .doesNotContain("9876543210")
            .doesNotContain("4111111111111111")
            .contains("[REDACTED_OTP]")
            .contains("[REDACTED_SECRET]")
            .contains("[REDACTED_TOKEN]");
    }
}
