package in.craves.auth.centralotp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.auth.exception.AuthException;
import in.craves.auth.msg91.Msg91Properties;
import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

public class CentralOtpBypassVerification {
    private static int checks;
    private static final String CODE = "135790";
    private static void check(boolean value, String message) {
        checks++;
        if (!value) throw new AssertionError(message);
    }
    private static void reject(Runnable operation, String expected) {
        try { operation.run(); throw new AssertionError("Expected rejection: " + expected); }
        catch (AuthException failure) { check(expected.equals(failure.getCode()), "Unexpected rejection code"); }
    }
    private static final class TestClock extends Clock {
        Instant now = Instant.now();
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    private static CentralOtpProvider provider(URI base, CentralOtpTestBypass policy) throws Exception {
        CentralOtpProvider provider = new CentralOtpProvider(new Msg91Properties(true, "test-provider-key"),
                "aaaaaaaaaaaaaaaaaaaaaaaa", base);
        Field field = CentralOtpProvider.class.getDeclaredField("testBypass");
        field.setAccessible(true);
        field.set(provider, policy);
        return provider;
    }

    public static void main(String[] args) throws Exception {
        String whitelist = Files.readString(Path.of(args[0]));
        Map<String, String> phones = new ObjectMapper().readValue(whitelist, new TypeReference<Map<String, String>>() {});
        check(phones.size() == 210, "Whitelist count");
        String sample = phones.keySet().iterator().next();
        String normal = "+919999999999";
        check(!phones.containsKey(normal), "Normal fixture is outside whitelist");
        AtomicInteger networkCalls = new AtomicInteger();
        AtomicReference<String> reply = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            networkCalls.incrementAndGet();
            check("test-provider-key".equals(exchange.getRequestHeaders().getFirst("authkey")), "Provider header retained");
            String response = reply.get();
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        URI base = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        try {
            CentralOtpProvider normalProvider = new CentralOtpProvider(new Msg91Properties(true, "test-provider-key"),
                    "aaaaaaaaaaaaaaaaaaaaaaaa", base);
            reply.set("{\"type\":\"success\",\"request_id\":\"fixture-request\"}");
            normalProvider.send(normal);
            reply.set("{\"type\":\"success\",\"message\":\"OTP verified success\"}");
            normalProvider.verify(normal, CODE);
            reply.set("{\"type\":\"error\",\"message\":\"OTP not match\"}");
            reject(() -> normalProvider.verify(normal, CODE), "OTP_INVALID");
            reply.set("{\"type\":\"error\",\"message\":\"OTP expired\"}");
            reject(() -> normalProvider.verify(normal, CODE), "OTP_EXPIRED");
            reply.set("{\"type\":\"error\",\"code\":\"418\"}");
            reject(() -> normalProvider.send(normal), "OTP_UNAVAILABLE");
            check(networkCalls.get() == 5, "Normal paths still invoke provider");
            if (args.length > 1 && args[1].equals("baseline")) {
                System.out.println("PASS original runtime normal-provider checks=" + checks);
                return;
            }

            TestClock clock = new TestClock();
            String expiry = clock.instant().plusSeconds(3600).toString();
            CentralOtpTestBypass policy = new CentralOtpTestBypass(true, whitelist, CODE, expiry, "prodlow", clock);
            CentralOtpProvider bypassProvider = provider(base, policy);
            int before = networkCalls.get();
            for (String phone : phones.keySet()) {
                check(policy.contains(phone), "Exact listed number is included");
                bypassProvider.send(phone);
                bypassProvider.verify(phone, CODE);
            }
            reject(() -> bypassProvider.verify(sample, "000000"), "OTP_INVALID");
            check(networkCalls.get() == before, "All 210 bypass paths make zero provider calls");
            check(!policy.contains(sample.substring(0, sample.length() - 1)), "No prefix matching");
            check(!policy.contains(sample.substring(1)), "No unnormalized matching");
            check(!policy.contains(sample + "0"), "No suffix matching");
            check(!policy.contains(null), "Null is not whitelisted");
            reply.set("{\"type\":\"success\",\"request_id\":\"fixture-request\"}");
            bypassProvider.send(normal);
            check(networkCalls.get() == before + 1, "Non-whitelist still calls provider while enabled");
            clock.now = Instant.parse(expiry);
            reject(() -> bypassProvider.send(sample), "OTP_UNAVAILABLE");
            reject(() -> bypassProvider.verify(sample, CODE), "OTP_UNAVAILABLE");
            check(networkCalls.get() == before + 1, "Expired synthetic numbers do not send SMS");
            CentralOtpProvider off = provider(base, new CentralOtpTestBypass(false, whitelist, CODE, expiry, "prodlow", clock));
            reject(() -> off.send(sample), "OTP_UNAVAILABLE");
            reject(() -> off.verify(sample, CODE), "OTP_UNAVAILABLE");
            off.send(normal);
            check(networkCalls.get() == before + 2, "Disabled bypass leaves normal numbers working");
            for (String bad : new String[]{"{\"+91999999999*\":\"CUST-E2E-001\"}", "{", "{}"}) {
                try {
                    new CentralOtpTestBypass(true, bad, CODE, expiry, "prodlow", clock);
                    throw new AssertionError("Invalid config accepted");
                } catch (IllegalArgumentException expected) { checks++; }
            }
            try {
                new CentralOtpTestBypass(true, whitelist, CODE, clock.instant().plusSeconds(86401).toString(), "prodlow", clock);
                throw new AssertionError("More than 24-hour activation accepted");
            } catch (IllegalArgumentException expected) { checks++; }
            try (AnnotationConfigApplicationContext spring = new AnnotationConfigApplicationContext()) {
                spring.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                        "CRAVES_OTP_TEST_ENABLED", "true", "CRAVES_OTP_TEST_WHITELIST_JSON", whitelist,
                        "CRAVES_OTP_TEST_CODE", CODE, "CRAVES_OTP_TEST_EXPIRES_AT", Instant.now().plusSeconds(3600).toString(),
                        "CRAVES_ENVIRONMENT", "prodlow")));
                spring.registerBean(Msg91Properties.class, () -> new Msg91Properties(false, ""));
                spring.register(CentralOtpTestBypass.class, CentralOtpProvider.class);
                spring.refresh();
                spring.getBean(CentralOtpProvider.class).send(sample);
                spring.getBean(CentralOtpProvider.class).verify(sample, CODE);
                checks += 2;
            }
            System.out.println("PASS bypass and normal-provider checks=" + checks + "; whitelist=210; bypassProviderCalls=0");
        } finally { server.stop(0); }
    }
}
