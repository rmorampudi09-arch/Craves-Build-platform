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

/** taste-memory is switched off but its schema exists (the test migrates it); partner-offers is switched off and never migrated. */
@TestPropertySource(properties = {
        "craves.internal.service-secret=" + AccountErasureIT.SECRET,
        "CRAVES_ADV_TASTE_MEMORY_ENABLED=false",
        "CRAVES_ADV_PARTNER_OFFERS_ENABLED=false"})
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
        assertThat(jdbc.queryForObject("SELECT to_regnamespace('adv_partner_offers') IS NULL", Boolean.class)).isTrue();
        UUID person = UUID.randomUUID();
        makeFoodList(person);

        internal(BASE, erasureBody(person, "CUSTOMER"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.partner-offers").value(0))
                .andExpect(jsonPath("$.counts.food-lists").value(1));

        // Erasing never creates the schema it skipped.
        assertThat(jdbc.queryForObject("SELECT to_regnamespace('adv_partner_offers') IS NULL", Boolean.class)).isTrue();
        assertThat(foodLists(person)).isZero();
    }

    @Test
    void chefScopeErasesNothingSoACustomerKeepsTheirData() throws Exception {
        UUID person = UUID.randomUUID();
        makeFoodList(person);
        jdbc.update("INSERT INTO adv_taste_data.consent (person_id, personalization, product_analytics, updated_at) VALUES (?, true, true, now())", person);
        UUID batch = UUID.randomUUID();
        jdbc.update("INSERT INTO adv_kitchen_capacity.batch (id, menu_item_id, kitchen_id, chef_id, service_date, portions, status, version, created_at, updated_at) "
                + "VALUES (?, ?, ?, ?, current_date, 10, 'OPEN', 0, now(), now())", batch, UUID.randomUUID(), UUID.randomUUID(), person);
        // The person's hold as a customer of another kitchen's batch.
        jdbc.update("INSERT INTO adv_kitchen_capacity.hold (id, batch_id, person_id, portions, status, expires_at, created_at, updated_at) "
                + "VALUES (?, ?, ?, 2, 'CONFIRMED', now() + interval '1 day', now(), now())", UUID.randomUUID(), batch, person);

        internal(BASE, erasureBody(person, "CHEF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.service").value("advanced")).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.length()").value(0));

        assertThat(count("SELECT count(*) FROM adv_kitchen_capacity.hold WHERE person_id = ?", person)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM adv_kitchen_capacity.batch WHERE chef_id = ?", person)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM adv_taste_data.consent WHERE person_id = ?", person)).isEqualTo(1);
        assertThat(foodLists(person)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM adv_platform.idempotency_record WHERE actor_id = ?", person)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM adv_taste_data.erasure_receipt WHERE person_id = ?", person)).isZero();
    }

    private static final UUID NIL = new UUID(0, 0);

    @Test
    void customerErasureKeepsTheChefSideOfADualRolePerson() throws Exception {
        UUID person = UUID.randomUUID();
        Seed seed = seedDualRole(person);

        internal(BASE, erasureBody(person, "CUSTOMER"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.trust").value(1)).andExpect(jsonPath("$.counts.order-amendments").value(1));

        // As a customer: gone from the dispute (withdrawn, text cleared) and from the amendment (notes cleared).
        assertThat(jdbc.queryForMap("SELECT customer_id, description, status FROM adv_trust.dispute WHERE id = ?", seed.customerDispute()))
                .containsEntry("customer_id", NIL).containsEntry("description", null).containsEntry("status", "WITHDRAWN");
        assertThat(jdbc.queryForMap("SELECT customer_id, proposer_id, note, answered_by FROM adv_order_amendments.amendment WHERE id = ?", seed.customerAmendment()))
                .containsEntry("customer_id", NIL).containsEntry("proposer_id", NIL).containsEntry("note", null).containsEntry("answered_by", seed.otherChef());
        // As the chef: the person is still on the dispute against them and on the amendments they proposed and answered.
        assertThat(jdbc.queryForMap("SELECT chef_id, chef_statement FROM adv_trust.dispute WHERE id = ?", seed.chefDispute()))
                .containsEntry("chef_id", person).containsEntry("chef_statement", "Delivered at 1pm");
        assertThat(jdbc.queryForObject("SELECT proposer_id FROM adv_order_amendments.amendment WHERE id = ?", UUID.class, seed.proposedAsChef())).isEqualTo(person);
        assertThat(jdbc.queryForObject("SELECT answered_by FROM adv_order_amendments.amendment WHERE id = ?", UUID.class, seed.answeredAsChef())).isEqualTo(person);

        // Retry: nothing more to do.
        internal(BASE, erasureBody(person, "CUSTOMER"))
                .andExpect(jsonPath("$.counts.trust").value(0)).andExpect(jsonPath("$.counts.order-amendments").value(0));
    }

    @Test
    void allScopeErasesBothSidesOfADualRolePerson() throws Exception {
        UUID person = UUID.randomUUID();
        Seed seed = seedDualRole(person);

        internal(BASE, erasureBody(person, "ALL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.counts.trust").value(2)).andExpect(jsonPath("$.counts.order-amendments").value(3));

        assertThat(jdbc.queryForMap("SELECT customer_id, description FROM adv_trust.dispute WHERE id = ?", seed.customerDispute()))
                .containsEntry("customer_id", NIL).containsEntry("description", null);
        assertThat(jdbc.queryForObject("SELECT chef_id FROM adv_trust.dispute WHERE id = ?", UUID.class, seed.chefDispute())).isEqualTo(NIL);
        assertThat(jdbc.queryForObject("SELECT proposer_id FROM adv_order_amendments.amendment WHERE id = ?", UUID.class, seed.proposedAsChef())).isEqualTo(NIL);
        assertThat(jdbc.queryForObject("SELECT answered_by FROM adv_order_amendments.amendment WHERE id = ?", UUID.class, seed.answeredAsChef())).isEqualTo(NIL);
        assertThat(jdbc.queryForObject("SELECT customer_id FROM adv_order_amendments.amendment WHERE id = ?", UUID.class, seed.customerAmendment())).isEqualTo(NIL);
        assertThat(count("SELECT count(*) FROM adv_trust.dispute WHERE chef_id = ? OR customer_id = ?", person, person)).isZero();
    }

    private record Seed(UUID customerDispute, UUID chefDispute, UUID customerAmendment, UUID proposedAsChef, UUID answeredAsChef, UUID otherChef) { }

    /** One person who is a customer and a chef: a dispute each way, an amendment they proposed as the customer, one they proposed and one they answered as the chef. */
    private Seed seedDualRole(UUID person) {
        Seed seed = new Seed(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        jdbc.update("INSERT INTO adv_trust.dispute_policy (version, window_hours, created_by, created_at) VALUES (1, 24, ?, now()) ON CONFLICT DO NOTHING", UUID.randomUUID());
        String dispute = "INSERT INTO adv_trust.dispute (id, order_id, customer_id, kitchen_id, category, description, order_value_paise, refundable_paise, "
                + "chef_statement, chef_id, status, policy_version, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'LATE', ?, 50000, 50000, ?, ?, 'OPEN', 1, 0, now(), now())";
        jdbc.update(dispute, seed.customerDispute(), UUID.randomUUID(), person, UUID.randomUUID(), "It came cold", null, seed.otherChef());
        jdbc.update(dispute, seed.chefDispute(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Never arrived", "Delivered at 1pm", person);
        String amendment = "INSERT INTO adv_order_amendments.amendment (id, order_id, seq, kitchen_id, customer_id, proposed_by, proposer_id, changes, food_delta_paise, "
                + "note, status, answer_note, answered_by, expires_at, version, created_at, updated_at) "
                + "VALUES (?, ?, 1, ?, ?, ?, ?, '[{\"kind\":\"REMOVE\"}]'::jsonb, -100, 'a note', 'ACCEPTED', 'ok', ?, now() + interval '1 day', 0, now(), now())";
        UUID other = UUID.randomUUID();
        jdbc.update(amendment, seed.customerAmendment(), UUID.randomUUID(), UUID.randomUUID(), person, "CUSTOMER", person, seed.otherChef());
        jdbc.update(amendment, seed.proposedAsChef(), UUID.randomUUID(), UUID.randomUUID(), other, "CHEF", person, other);
        jdbc.update(amendment, seed.answeredAsChef(), UUID.randomUUID(), UUID.randomUUID(), other, "CUSTOMER", other, person);
        return seed;
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

    private int count(String sql, UUID... args) {
        return jdbc.queryForObject(sql, Integer.class, (Object[]) args);
    }

    /** What ModuleRuntime did for the module while it was still switched on. */
    private void migrate(String schema, String folder) {
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).createSchemas(true)
                .locations("classpath:db/advanced/" + folder).table("flyway_schema_history").load().migrate();
    }
}
