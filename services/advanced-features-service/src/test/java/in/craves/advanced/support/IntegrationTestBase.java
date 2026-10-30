package in.craves.advanced.support;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.OrderCartGateway;
import in.craves.advanced.platform.module.FeatureModule;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Full application on a real, disposable PostgreSQL database (ADV_TEST_JDBC_URL points at a server where the test user
 * may create databases). Every test class gets its own database, created here and never shared.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(IntegrationTestBase.TestBeans.class)
public abstract class IntegrationTestBase {
    protected static final FakeCatalog CATALOG = new FakeCatalog();
    protected static final FakeCart CART = new FakeCart();
    protected static final MutableClock CLOCK = new MutableClock();

    @Autowired
    protected MockMvc mvc;

    @TestConfiguration
    public static class TestBeans {
        @Bean @Primary CatalogGateway testCatalog() { return CATALOG; }
        @Bean @Primary OrderCartGateway testCart() { return CART; }
        @Bean @Primary Clock testClock() { return CLOCK; }

        /** A deliberately broken module: proves one failing feature cannot take the others down. */
        @Bean FeatureModule brokenFeature() {
            return new FeatureModule("broken-feature", "adv_broken_feature", List.of("/api/v1/advanced/broken-feature"), List.of(), List.of());
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        String admin = System.getenv().getOrDefault("ADV_TEST_JDBC_URL", "jdbc:postgresql://127.0.0.1:55432/postgres");
        String user = System.getenv().getOrDefault("ADV_TEST_DB_USER", "postgres");
        String password = System.getenv().getOrDefault("ADV_TEST_DB_PASSWORD", "");
        String name = "adv_it_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        try (Connection connection = DriverManager.getConnection(admin, user, password); Statement statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + name);
        }
        String url = admin.substring(0, admin.lastIndexOf('/') + 1) + name;
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
        registry.add("advanced.verification-pem-base64", TestTokens::publicPemBase64);
        registry.add("advanced.admin-session-check-enabled", () -> "false");
    }

    @BeforeEach
    void resetFakes() {
        CATALOG.reset();
        CART.carts.clear();
        CLOCK.reset();
    }

    protected static String bearer(UUID user, String... roles) {
        return "Bearer " + TestTokens.token(user, CLOCK.instant(), TestTokens.AUDIENCE, roles);
    }
}
