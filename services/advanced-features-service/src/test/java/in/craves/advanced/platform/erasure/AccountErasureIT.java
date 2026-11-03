package in.craves.advanced.platform.erasure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.support.IntegrationTestBase;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/** taste-memory is switched off but its schema exists (the test migrates it); trust is switched off and never migrated. */
@TestPropertySource(properties = {
        "craves.internal.service-secret=" + AccountErasureIT.SECRET,
        "CRAVES_ADV_TASTE_MEMORY_ENABLED=false",
        "CRAVES_ADV_TRUST_ENABLED=false"})
class AccountErasureIT extends IntegrationTestBase {
    static final String SECRET = "test-internal-secret-0123456789";
    private static final String BASE = "/internal/v1/account-erasure";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DataSource dataSource;
    @Autowired
    ConfigurableEnvironment environment;

    @Test
    void internalEraseNeedsTheSecret() throws Exception {
        UUID person = UUID.randomUUID();
        String body = erasureBody(person, "CUSTOMER");
        makeFoodList(person);

        for (String path : new String[] {BASE, BASE + "/prepare", BASE + "/blockers"}) {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
            mvc.perform(post(path).header("X-Craves-Internal-Secret", "wrong").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized());
        }
        // A person's own access token is no substitute for the secret.
        mvc.perform(post(BASE).header("Authorization", bearer(person, "CUSTOMER", "PLATFORM_ADMIN")).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        assertThat(foodLists(person)).isEqualTo(1);

        // No secret configured: the endpoints are off, whatever the caller sends.
        environment.getPropertySources().addFirst(new MapPropertySource("no-secret", Map.of("craves.internal.service-secret", "")));
        try {
            mvc.perform(post(BASE).header("X-Craves-Internal-Secret", SECRET).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isServiceUnavailable());
            mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isServiceUnavailable());
            mvc.perform(post(BASE).header("X-Craves-Internal-Secret", "").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isServiceUnavailable());
        } finally {
            environment.getPropertySources().remove("no-secret");
        }
        assertThat(foodLists(person)).isEqualTo(1);
    }

    @Test
    void blockersAreAlwaysEmptyAndPrepareHasNothingToDo() throws Exception {
        UUID person = UUID.randomUUID();
        internal(BASE + "/blockers", "{\"identityId\":\"" + person + "\",\"scope\":\"ALL\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.service").value("advanced")).andExpect(jsonPath("$.blockers.length()").value(0));
        internal(BASE + "/prepare", erasureBody(person, "ALL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE")).andExpect(jsonPath("$.counts.length()").value(0));
    }

    @Test
    void badBodiesAre400() throws Exception {
        UUID person = UUID.randomUUID();
        internal(BASE, "{\"requestId\":\"" + UUID.randomUUID() + "\",\"identityId\":\"" + person + "\",\"scope\":\"EVERYONE\"}").andExpect(status().isBadRequest());
        internal(BASE, "{\"requestId\":\"" + UUID.randomUUID() + "\",\"scope\":\"ALL\"}").andExpect(status().isBadRequest());
        internal(BASE, "{\"identityId\":\"" + person + "\",\"scope\":\"ALL\"}").andExpect(status().isBadRequest());
        internal(BASE, "{\"requestId\":\"nope\",\"identityId\":\"" + person + "\",\"scope\":\"ALL\"}").andExpect(status().isBadRequest());
        internal(BASE + "/blockers", "{\"scope\":\"ALL\"}").andExpect(status().isBadRequest());
        internal(BASE + "/prepare", "{\"identityId\":\"" + person + "\",\"scope\":\"ALL\"}").andExpect(status().isBadRequest());
    }

    @Test
    void internalEraseCoversASwitchedOffModule() throws Exception {
        migrate("adv_taste_memory", "taste_memory");
        UUID person = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        String me = bearer(person, "CUSTOMER");
        makeFoodList(person);
        makeFoodList(other);
        mvc.perform(put("/api/v1/advanced/my-taste-data/consent").header("Authorization", me).contentType(MediaType.APPLICATION_JSON)
                .content("{\"personalization\":true,\"productAnalytics\":true}")).andExpect(status().isOk());
        jdbc.update("INSERT INTO adv_taste_memory.profile (person_id, spice, updated_at) VALUES (?, 'MILD', now()), (?, 'MILD', now())", person, other);
        // The module is off: the person's own call refuses it, but the internal erase still reaches its rows.
        mvc.perform(get("/api/v1/advanced/taste-memory").header("Authorization", me)).andExpect(status().isServiceUnavailable());

        internal(BASE, erasureBody(person, "CUSTOMER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("advanced"))
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.taste-memory").value(1))
                .andExpect(jsonPath("$.counts.food-lists").value(1))
                .andExpect(jsonPath("$.counts.taste-data").value(1));

        assertThat(count("SELECT count(*) FROM adv_taste_memory.profile WHERE person_id = ?", person)).isZero();
        assertThat(foodLists(person)).isZero();
        assertThat(count("SELECT count(*) FROM adv_taste_data.consent WHERE person_id = ?", person)).isZero();
        assertThat(count("SELECT count(*) FROM adv_platform.idempotency_record WHERE actor_id = ?", person)).isZero();
        // Somebody else's rows stay.
        assertThat(count("SELECT count(*) FROM adv_taste_memory.profile WHERE person_id = ?", other)).isEqualTo(1);
        assertThat(foodLists(other)).isEqualTo(1);
        // One receipt: it names the modules, not the person's data.
        assertThat(jdbc.queryForObject("SELECT records FROM adv_taste_data.erasure_receipt WHERE person_id = ?", Integer.class, person)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT array_to_string(modules, ',') FROM adv_taste_data.erasure_receipt WHERE person_id = ?", String.class, person))
                .contains("food-lists").contains("taste-memory");

        // A retry answers DONE with nothing left to count and leaves no second receipt.
        internal(BASE, erasureBody(person, "ALL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.taste-memory").value(0)).andExpect(jsonPath("$.counts.food-lists").value(0))
                .andExpect(jsonPath("$.counts.taste-data").value(0));
        assertThat(count("SELECT count(*) FROM adv_taste_data.erasure_receipt WHERE person_id = ?", person)).isEqualTo(1);
    }

    @Test
    void internalEraseSkipsAModuleWhoseSchemaNeverExisted() throws Exception {
        assertThat(jdbc.queryForObject("SELECT to_regnamespace('adv_trust') IS NULL", Boolean.class)).isTrue();
        UUID person = UUID.randomUUID();
        makeFoodList(person);

        internal(BASE, erasureBody(person, "CUSTOMER"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.trust").value(0))
                .andExpect(jsonPath("$.counts.food-lists").value(1));

        // Erasing never creates the schema it skipped.
        assertThat(jdbc.queryForObject("SELECT to_regnamespace('adv_trust') IS NULL", Boolean.class)).isTrue();
        assertThat(foodLists(person)).isZero();
    }

    @Test
    void chefScopeTouchesOnlyTheKitchenCapacityModule() throws Exception {
        UUID person = UUID.randomUUID();
        makeFoodList(person);
        UUID batch = UUID.randomUUID();
        jdbc.update("INSERT INTO adv_kitchen_capacity.batch (id, menu_item_id, kitchen_id, chef_id, service_date, portions, status, version, created_at, updated_at) "
                + "VALUES (?, ?, ?, ?, current_date, 10, 'OPEN', 0, now(), now())", batch, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        jdbc.update("INSERT INTO adv_kitchen_capacity.hold (id, batch_id, person_id, portions, status, expires_at, created_at, updated_at) "
                + "VALUES (?, ?, ?, 2, 'CONFIRMED', now() + interval '1 day', now(), now())", UUID.randomUUID(), batch, person);

        internal(BASE, erasureBody(person, "CHEF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.kitchen-capacity").value(1))
                .andExpect(jsonPath("$.counts.food-lists").doesNotExist())
                .andExpect(jsonPath("$.counts.taste-data").doesNotExist());

        assertThat(count("SELECT count(*) FROM adv_kitchen_capacity.hold WHERE person_id = ?", person)).isZero();
        assertThat(foodLists(person)).isEqualTo(1);
    }

    private ResultActions internal(String path, String body) throws Exception {
        return mvc.perform(post(path).header("X-Craves-Internal-Secret", SECRET).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String erasureBody(UUID person, String scope) {
        return "{\"requestId\":\"" + UUID.randomUUID() + "\",\"identityId\":\"" + person + "\",\"scope\":\"" + scope + "\"}";
    }

    /** A keyed request: leaves a food list and a stored reply that holds the list's name. */
    private void makeFoodList(UUID person) throws Exception {
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", bearer(person, "CUSTOMER"))
                .header("Idempotency-Key", "erase-" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Mine\"}"))
                .andExpect(status().isCreated());
    }

    private int foodLists(UUID person) {
        return count("SELECT count(*) FROM adv_food_lists.food_list WHERE owner_id = ?", person);
    }

    private int count(String sql, UUID person) {
        return jdbc.queryForObject(sql, Integer.class, person);
    }

    /** What ModuleRuntime did for the module while it was still switched on. */
    private void migrate(String schema, String folder) {
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).createSchemas(true)
                .locations("classpath:db/advanced/" + folder).table("flyway_schema_history").load().migrate();
    }
}
