package in.craves.advanced.experiments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class ExperimentsIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/experiments";
    @Autowired
    JdbcTemplate jdbc;
    String admin;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM adv_experiments.event");
        jdbc.update("DELETE FROM adv_experiments.experiment");
        admin = bearer(UUID.randomUUID(), "PLATFORM_ADMIN");
    }

    ResultActions send(String method, String auth, String path, String body) throws Exception {
        var request = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            default -> throw new IllegalArgumentException(method);
        };
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    void running(String key) throws Exception {
        send("POST", admin, BASE + "/admin/experiments", "{\"key\":\"" + key + "\",\"description\":\"New dish card\","
                + "\"variants\":[{\"key\":\"control\",\"weight\":1},{\"key\":\"new-card\",\"weight\":1}]}").andExpect(status().isCreated());
        send("POST", admin, BASE + "/admin/experiments/" + key + "/start", "{\"expectedVersion\":1}").andExpect(status().isOk());
    }

    String consenting(UUID person, boolean analytics) throws Exception {
        String auth = bearer(person, "CUSTOMER");
        send("PUT", auth, "/api/v1/advanced/my-taste-data/consent", "{\"personalization\":false,\"productAnalytics\":" + analytics + "}")
                .andExpect(status().isOk());
        return auth;
    }

    static String event(UUID id, String name, String experiment, Instant at) {
        return "{\"eventId\":\"" + id + "\",\"name\":\"" + name + "\"," + (experiment == null ? "" : "\"experimentKey\":\"" + experiment + "\",")
                + "\"occurredAt\":\"" + at + "\",\"properties\":{\"screen\":\"home\",\"position\":2}}";
    }

    @Test
    void staffRunTheLifecycleAndVariantsFreezeOnceRunning() throws Exception {
        String body = "{\"key\":\"dish-card\",\"description\":\"New dish card\",\"variants\":[{\"key\":\"va\",\"weight\":1},{\"key\":\"va\",\"weight\":1}]}";
        send("POST", admin, BASE + "/admin/experiments", body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DUPLICATE_VARIANT"));
        send("POST", admin, BASE + "/admin/experiments", body.replace("{\"key\":\"va\",\"weight\":1}]", "{\"key\":\"vb\",\"weight\":3}]"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT")).andExpect(jsonPath("$.version").value(1));
        send("POST", admin, BASE + "/admin/experiments", body.replace("{\"key\":\"va\",\"weight\":1}]", "{\"key\":\"vb\",\"weight\":3}]"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXPERIMENT_EXISTS"));
        String change = "{\"description\":\"Bigger photo\",\"variants\":[{\"key\":\"va\",\"weight\":1},{\"key\":\"vb\",\"weight\":1}],\"expectedVersion\":%d}";
        send("PUT", admin, BASE + "/admin/experiments/dish-card", change.formatted(9)).andExpect(status().isPreconditionFailed());
        send("PUT", admin, BASE + "/admin/experiments/dish-card", change.formatted(1)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));

        String customer = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(get(BASE + "/mine").param("keys", "dish-card,unknown").header("Authorization", customer))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].variant").doesNotExist()).andExpect(jsonPath("$[1].variant").doesNotExist());

        send("POST", admin, BASE + "/admin/experiments/dish-card/stop", "{\"expectedVersion\":2}").andExpect(status().isConflict());
        send("POST", admin, BASE + "/admin/experiments/dish-card/start", "{\"expectedVersion\":2}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING")).andExpect(jsonPath("$.startedAt").isNotEmpty());
        send("PUT", admin, BASE + "/admin/experiments/dish-card", change.formatted(3)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EXPERIMENT_NOT_DRAFT"));

        String first = mvc.perform(get(BASE + "/mine").param("keys", "dish-card").header("Authorization", customer))
                .andExpect(jsonPath("$[0].variant").isNotEmpty()).andReturn().getResponse().getContentAsString();
        String again = mvc.perform(get(BASE + "/mine").param("keys", "dish-card").header("Authorization", customer))
                .andReturn().getResponse().getContentAsString();
        assertThat(again).isEqualTo(first);

        send("POST", admin, BASE + "/admin/experiments/dish-card/stop", "{\"expectedVersion\":3}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("STOPPED"));
        mvc.perform(get(BASE + "/mine").param("keys", "dish-card").header("Authorization", customer)).andExpect(jsonPath("$[0].variant").doesNotExist());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'experiments'", Integer.class)).isGreaterThanOrEqualTo(4);
    }

    @Test
    void onlyStaffManageAndReadResults() throws Exception {
        String customer = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(get(BASE + "/admin/experiments").header("Authorization", customer)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/experiments").header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN"))).andExpect(status().isOk());
        send("POST", bearer(UUID.randomUUID(), "AUDIT_ADMIN"), BASE + "/admin/experiments",
                "{\"key\":\"x-test\",\"description\":\"x\",\"variants\":[{\"key\":\"va\",\"weight\":1},{\"key\":\"vb\",\"weight\":1}]}")
                .andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/mine").param("keys", "x")).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE + "/events").contentType(MediaType.APPLICATION_JSON).content("{\"events\":[]}")).andExpect(status().isUnauthorized());
    }

    @Test
    void eventsAreKeptOnlyWithConsentAndCountedPerVariant() throws Exception {
        running("dish-card");
        Instant now = CLOCK.instant();
        // Without consent the batch is accepted and dropped.
        UUID silent = UUID.randomUUID();
        String silentAuth = consenting(silent, false);
        send("POST", silentAuth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", "dish-card", now) + "]}")
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.recorded").value(0)).andExpect(jsonPath("$.consented").value(false));
        send("POST", bearer(UUID.randomUUID(), "CUSTOMER"), BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", null, now) + "]}")
                .andExpect(jsonPath("$.recorded").value(0));

        // Twelve consenting people: every one is exposed, every one views; a retry is not counted twice.
        for (int i = 0; i < 12; i++) {
            UUID person = UUID.randomUUID();
            String auth = consenting(person, true);
            UUID view = UUID.randomUUID();
            String batch = "{\"events\":[" + event(UUID.randomUUID(), "experiment.exposure", "dish-card", now) + ","
                    + event(view, "dish.view", "dish-card", now.minusSeconds(30)) + "]}";
            send("POST", auth, BASE + "/events", batch).andExpect(status().isAccepted()).andExpect(jsonPath("$.recorded").value(2));
            send("POST", auth, BASE + "/events", "{\"events\":[" + event(view, "dish.view", "dish-card", now) + "]}")
                    .andExpect(jsonPath("$.recorded").value(0)).andExpect(jsonPath("$.consented").value(true));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_experiments.event", Integer.class)).isEqualTo(24);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_experiments.event WHERE person_id = ?", Integer.class, silent)).isZero();

        String results = mvc.perform(get(BASE + "/admin/experiments/dish-card/results").param("event", "dish.view").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.suppressedBelow").value(5)).andExpect(jsonPath("$.variants.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        // 12 people over two variants: each variant's numbers are either shown (>= 5) or hidden, never a small number.
        assertThat(results).doesNotContainPattern("\"people\":[1-4][,}]");
        String day = now.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate().toString();
        mvc.perform(get(BASE + "/admin/events/daily").param("name", "dish.view").param("from", day).param("to", day).header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.days[0].people").value(12)).andExpect(jsonPath("$.days[0].events").value(12));
        mvc.perform(get(BASE + "/admin/events/daily").param("name", "experiment.exposure").param("from", "2026-01-01").param("to", "2026-12-31")
                .header("Authorization", admin)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RANGE"));
    }

    @Test
    void badEventsAreRefusedAndTheVariantIsNeverTakenFromTheApp() throws Exception {
        running("dish-card");
        UUID person = UUID.randomUUID();
        String auth = consenting(person, true);
        Instant now = CLOCK.instant();
        UUID old = UUID.randomUUID();
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(old, "dish.view", null, now.minus(Duration.ofDays(8))) + "]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_EVENTS")).andExpect(jsonPath("$.details[0]").value(old.toString()));
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", null, now.plus(Duration.ofHours(1))) + "]}")
                .andExpect(status().isBadRequest());
        send("POST", auth, BASE + "/events", "{\"events\":[{\"eventId\":\"" + UUID.randomUUID() + "\",\"name\":\"dish.view\",\"occurredAt\":\""
                + now + "\",\"properties\":{\"nested\":{\"a\":1}}}]}").andExpect(status().isBadRequest());
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "Dish View!", null, now) + "]}").andExpect(status().isBadRequest());

        // An unknown or draft experiment is dropped from the event; the event itself is kept.
        send("POST", admin, BASE + "/admin/experiments", "{\"key\":\"later\",\"description\":\"d\",\"variants\":[{\"key\":\"va\",\"weight\":1},{\"key\":\"vb\",\"weight\":1}]}")
                .andExpect(status().isCreated());
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", "later", now) + ","
                + event(UUID.randomUUID(), "dish.view", "nothing-here", now) + "," + event(UUID.randomUUID(), "dish.view", "dish-card", now) + "]}")
                .andExpect(jsonPath("$.recorded").value(3));
        String variant = mvc.perform(get(BASE + "/mine").param("keys", "dish-card").header("Authorization", auth)).andReturn().getResponse()
                .getContentAsString().replaceAll(".*\"variant\":\"([^\"]+)\".*", "$1");
        assertThat(jdbc.queryForList("SELECT coalesce(variant, '-') FROM adv_experiments.event WHERE person_id = ? ORDER BY variant NULLS FIRST",
                String.class, person)).containsExactly("-", "-", variant);
    }

    @Test
    void exportAndEraseCoverEvents() throws Exception {
        running("dish-card");
        UUID person = UUID.randomUUID();
        String auth = consenting(person, true);
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", "dish-card", CLOCK.instant()) + "]}")
                .andExpect(jsonPath("$.recorded").value(1));
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.experiments.events.length()").value(1))
                .andExpect(jsonPath("$.experiments.events[0].name").value("dish.view"));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", auth).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_experiments.event WHERE person_id = ?", Integer.class, person)).isZero();
        // Erase also removed consent, so new events are dropped again.
        send("POST", auth, BASE + "/events", "{\"events\":[" + event(UUID.randomUUID(), "dish.view", null, CLOCK.instant()) + "]}")
                .andExpect(jsonPath("$.recorded").value(0));
    }
}
