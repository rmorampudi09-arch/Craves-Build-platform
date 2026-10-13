package in.craves.auth.centralotp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.msg91.Msg91Properties;
import java.time.Instant;
import java.util.LinkedHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

class CentralOtpProviderWiringTest {
    private static final String LISTED = "+919000000000";

    @Configuration
    @ComponentScan(basePackageClasses = CentralOtpProvider.class, excludeFilters = @ComponentScan.Filter(
            type = FilterType.ASSIGNABLE_TYPE, classes = {CentralOtpController.class, CentralOtpStore.class,
                    CentralOtpIdentity.class, CentralOtpRequestLimit.class}))
    static class CentralOtpComponents {}

    @Test void formerOtpTestSettingsNoLongerAcceptTheStaticCode() throws Exception {
        var whitelist = new LinkedHashMap<String, String>();
        for (int i = 0; i < 210; i++) whitelist.put("+91" + (9000000000L + i), "CUST-E2E-" + String.format("%03d", i + 1));
        new ApplicationContextRunner()
            .withUserConfiguration(CentralOtpComponents.class)
            .withBean(Msg91Properties.class, () -> new Msg91Properties(false, ""))
            .withPropertyValues("CRAVES_OTP_TEST_ENABLED=true",
                "CRAVES_OTP_TEST_WHITELIST_JSON=" + new ObjectMapper().writeValueAsString(whitelist),
                "CRAVES_OTP_TEST_CODE=135790",
                "CRAVES_OTP_TEST_EXPIRES_AT=" + Instant.now().plusSeconds(3600))
            .run(context -> {
                assertThat(context).hasSingleBean(CentralOtpProvider.class);
                var provider = context.getBean(CentralOtpProvider.class);
                // MSG91 is off here, so the normal provider path answers OTP_UNAVAILABLE for every number.
                assertEquals("OTP_UNAVAILABLE",
                    assertThrows(AuthException.class, () -> provider.verify(LISTED, "135790")).getCode());
                assertEquals("OTP_UNAVAILABLE", assertThrows(AuthException.class, () -> provider.send(LISTED)).getCode());
            });
    }
}
