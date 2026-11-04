package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

class AccountDeletionPropertiesTest {
    static final String HMAC = Base64.getEncoder().encodeToString("referral-hmac-key-for-tests-32-bytes!!".getBytes());

    AccountDeletionProperties configured() {
        var props = new AccountDeletionProperties();
        Map<String, AccountDeletionProperties.Service> services = new LinkedHashMap<>();
        for (String name : AccountErasureClient.ERASE_ORDER) {
            var service = new AccountDeletionProperties.Service();
            service.setBaseUrl("https://" + name + ".internal.example.test");
            service.setCredential("credential-of-" + name);
            services.put(name, service);
        }
        props.setServices(services);
        props.setReferralHmacKeyBase64(HMAC);
        return props;
    }

    AccountDeletionProperties bind(Map<String, Object> environment) throws Exception {
        var env = new StandardEnvironment();
        env.getPropertySources().addFirst(new MapPropertySource("test", environment));
        new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))
            .forEach(env.getPropertySources()::addLast);
        return Binder.get(env).bind("craves.account-deletion", AccountDeletionProperties.class).get();
    }

    @Test void startsWithNothingSetAndEverythingOff() throws Exception {
        var props = bind(Map.of());
        assertDoesNotThrow(props::validate);
        assertFalse(props.isEnabled());
        assertFalse(props.isWorkerEnabled());
        assertEquals(Duration.ofMinutes(1), props.getWorkerDelay());
        assertEquals(30, props.getWaitDays());
        assertEquals(7, props.getReminderDays());
        assertEquals(Duration.ofSeconds(20), props.getCallTimeout());
        assertEquals("", props.getReferralHmacKeyBase64());
        assertEquals("", props.getServices().get("user-chef").getBaseUrl());
        assertDoesNotThrow(() -> new AccountDeletionProperties().validate());
    }

    @Test void applicationYmlReadsTheDocumentedEnvironmentNames() throws Exception {
        Map<String, Object> environment = new LinkedHashMap<>();
        environment.put("CRAVES_ACCOUNT_DELETION_ENABLED", "true");
        environment.put("CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64", HMAC);
        for (String name : AccountErasureClient.ERASE_ORDER) {
            String env = name.toUpperCase().replace('-', '_');
            environment.put("CRAVES_ACCOUNT_DELETION_" + env + "_BASE_URL", "https://" + name + ".internal.example.test");
            if (!name.equals("referral")) environment.put("CRAVES_ACCOUNT_DELETION_" + env + "_CREDENTIAL", "credential-of-" + name);
        }
        var props = bind(environment);
        assertDoesNotThrow(props::validate);
        assertTrue(props.isEnabled());
        assertEquals("https://user-chef.internal.example.test", props.getServices().get("user-chef").getBaseUrl());
        assertEquals("credential-of-notification", props.getServices().get("notification").getCredential());
        assertEquals("https://referral.internal.example.test", props.getServices().get("referral").getBaseUrl());
    }

    @Test void validatesOnlyWhenEnabledOrTheWorkerIsEnabled() {
        var props = configured();
        props.getServices().get("order").setBaseUrl("");
        assertDoesNotThrow(props::validate);
        props.setEnabled(true);
        assertThrows(IllegalStateException.class, props::validate);
        props.setEnabled(false);
        props.setWorkerEnabled(true);
        assertThrows(IllegalStateException.class, props::validate);
    }

    @Test void enabledNeedsHttpsOrLocalhostUrlsCredentialsAndAStrongReferralKey() {
        var ok = configured();
        ok.setEnabled(true);
        ok.getServices().get("order").setBaseUrl("http://localhost:8080");
        assertDoesNotThrow(ok::validate);

        for (String url : new String[] {"http://order.internal.example.test", "order", "", "https://u:p@order.example.test",
            "https://order.example.test/api", "https://order.example.test?x=1"}) {
            var props = configured();
            props.setEnabled(true);
            props.getServices().get("order").setBaseUrl(url);
            assertThrows(IllegalStateException.class, props::validate, url);
        }
        for (String name : AccountErasureClient.ERASE_ORDER) {
            var props = configured();
            props.setWorkerEnabled(true);
            props.getServices().get(name).setCredential(" ");
            if (name.equals("referral")) assertDoesNotThrow(props::validate);
            else assertThrows(IllegalStateException.class, props::validate, name);
        }
        for (String key : new String[] {"", "not base64!", Base64.getEncoder().encodeToString("short".getBytes())}) {
            var props = configured();
            props.setEnabled(true);
            props.setReferralHmacKeyBase64(key);
            assertThrows(IllegalStateException.class, props::validate, key);
        }
        var missing = configured();
        missing.setEnabled(true);
        missing.getServices().remove("catalog");
        assertThrows(IllegalStateException.class, missing::validate);
    }
}
