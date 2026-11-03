package in.craves.advanced.accountdeletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class AccountDeletionIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/account-deletion";
    static final String ADMIN = BASE + "/admin/requests";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ModuleRuntime runtime;
    @Autowired
    AccountDeletionService service;
    @Autowired
    PlatformTransactionManager transactions;
    UUID person;
    String customer;
    String compliance;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM adv_account_deletion.request");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'account-deletion'");
        person = UUID.randomUUID();
        customer = bearer(person, "CUSTOMER", "CHEF");
        compliance = bearer(UUID.randomUUID(), "COMPLIANCE_ADMIN");
    }

    ResultActions ask(String auth, String confirm, String body) throws Exception {
        var request = post(BASE).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body);
        if (confirm != null) request.header("X-Confirm-Delete", confirm);
        return mvc.perform(request);
    }

    ResultActions staff(String auth, String id, String step, long version, String message) throws Exception {
        String body = "{\"expectedVersion\":" + version + (message == null ? "" : ",\"messageToPerson\":\"" + message + "\"") + "}";
        return mvc.perform(post(ADMIN + "/" + id + "/" + step).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String requestId(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    @Test
    void personAsksOnceAndSeesTheirRequest() throws Exception {
        mvc.perform(post(BASE).header("X-Confirm-Delete", "DELETE").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        ask(customer, null, "{}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONFIRMATION_REQUIRED"));
        ask(customer, "DELETE", "{\"reason\":\"bad\\u0000text\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REASON"));
        mvc.perform(get(BASE).header("Authorization", customer)).andExpect(status().isNotFound());

        String id = requestId(ask(customer, "DELETE", "{\"reason\":\"  Moving abroad  \"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REQUESTED")).andExpect(jsonPath("$.reason").value("Moving abroad")));
        ask(customer, "DELETE", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        mvc.perform(get(BASE).header("Authorization", customer)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        assertThat(jdbc.queryForObject("SELECT roles FROM adv_account_deletion.request WHERE id = ?", String.class, UUID.fromString(id)))
                .isEqualTo("CHEF,CUSTOMER");

        // Another person sees nothing of it.
        mvc.perform(get(BASE).header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER"))).andExpect(status().isNotFound());
        // The person's export lists it.
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", customer)).andExpect(status().isOk())
                .andExpect(jsonPath("$['account-deletion'].requests.length()").value(1));
    }

    @Test
    void staffWorkTheQueueAndCompletingErasesAdvancedData() throws Exception {
        String id = requestId(ask(customer, "DELETE", "{}").andExpect(status().isCreated()));
        jdbc.update("INSERT INTO adv_taste_data.consent (person_id, personalization, product_analytics, updated_at) VALUES (?, true, true, now())", person);

        mvc.perform(get(ADMIN).header("Authorization", customer)).andExpect(status().isForbidden());
        mvc.perform(get(ADMIN).param("status", "REQUESTED").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(id)).andExpect(jsonPath("$.items[0].roles[0]").value("CHEF"));
        staff(bearer(UUID.randomUUID(), "SUPPORT_ADMIN"), id, "start", 1, null).andExpect(status().isForbidden());
        staff(bearer(person, "PLATFORM_ADMIN"), id, "start", 1, null).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("OWN_REQUEST"));
        staff(compliance, id, "start", 9, null).andExpect(status().isPreconditionFailed());
        staff(compliance, id, "complete", 1, "Done").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DELETION_STATUS"));
        staff(compliance, id, "start", 1, null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.version").value(2));

        mvc.perform(delete(BASE).header("Authorization", customer)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DELETION_IN_PROGRESS"));

        staff(compliance, id, "complete", 2, "Your account and data were deleted").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED")).andExpect(jsonPath("$.advancedRecordsErased").value(1));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_taste_data.consent WHERE person_id = ?", Integer.class, person)).isZero();
        mvc.perform(get(BASE).header("Authorization", customer)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.messageToPerson").value("Your account and data were deleted")).andExpect(jsonPath("$.closedAt").isNotEmpty());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'account-deletion'", Integer.class))
                .isEqualTo(3);
    }

    @Test
    void refusingNeedsAMessageAndWithdrawnRequestsCanBeAskedAgain() throws Exception {
        String first = requestId(ask(customer, "DELETE", "{}").andExpect(status().isCreated()));
        staff(compliance, first, "reject", 1, null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MESSAGE_REQUIRED"));
        staff(compliance, first, "reject", 1, "You have an order on its way; ask again once it is delivered").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));
        mvc.perform(delete(BASE).header("Authorization", customer)).andExpect(status().isNotFound());

        String second = requestId(ask(customer, "DELETE", "{}").andExpect(status().isCreated()));
        assertThat(second).isNotEqualTo(first);
        mvc.perform(delete(BASE).header("Authorization", customer)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));
        staff(compliance, second, "start", 2, null).andExpect(status().isConflict());
        ask(customer, "DELETE", "{}").andExpect(status().isCreated());
    }

    @Test
    void queuePagesOldestFirstFiltersByStatusAndOnlyHandlersAct() throws Exception {
        String a = requestId(ask(bearer(UUID.randomUUID(), "CUSTOMER"), "DELETE", "{}"));
        CLOCK.advance(Duration.ofMinutes(1));
        String b = requestId(ask(bearer(UUID.randomUUID(), "CUSTOMER"), "DELETE", "{}"));
        String c = requestId(ask(bearer(UUID.randomUUID(), "CUSTOMER"), "DELETE", "{}"));
        String reader = bearer(UUID.randomUUID(), "SUPPORT_ADMIN");
        staff(reader, b, "complete", 1, "x").andExpect(status().isForbidden());
        staff(reader, b, "reject", 1, "x").andExpect(status().isForbidden());
        staff(compliance, b, "reject", 1, "Contact support first").andExpect(status().isOk());
        mvc.perform(get(ADMIN).param("status", "REJECTED").header("Authorization", reader)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].id").value(b));
        mvc.perform(get(ADMIN).param("status", "REQUESTED").header("Authorization", reader)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.items[0].id").value(a));

        // b and c were asked at the same instant: the keyset still pages through each exactly once.
        List<String> seen = new java.util.ArrayList<>();
        String cursor = null;
        do {
            var request = get(ADMIN).param("limit", "1").header("Authorization", compliance);
            if (cursor != null) request.param("cursor", cursor);
            String page = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            List<String> ids = JsonPath.read(page, "$.items[*].id");
            seen.addAll(ids);
            cursor = JsonPath.read(page, "$.nextCursor");
        } while (cursor != null);
        assertThat(seen).hasSize(3).startsWith(a).containsExactlyInAnyOrder(a, b, c);
        mvc.perform(get(ADMIN).param("limit", "0").header("Authorization", compliance)).andExpect(status().isBadRequest());
        mvc.perform(get(ADMIN + "/" + a).header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN"))).andExpect(status().isOk());
    }

    @Test
    @SuppressWarnings("unchecked")
    void completingWhileAModuleIsOffErasesNothingAndStaysInProgress() throws Exception {
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", customer).header("Idempotency-Key", "deletion-skip-00001")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Mine\"}")).andExpect(status().isCreated());
        jdbc.update("INSERT INTO adv_taste_data.consent (person_id, personalization, product_analytics, updated_at) VALUES (?, true, true, now())", person);
        String id = requestId(ask(customer, "DELETE", "{}"));
        staff(compliance, id, "start", 1, null).andExpect(status().isOk());
        Map<String, ModuleRuntime.Status> states = (Map<String, ModuleRuntime.Status>) ReflectionTestUtils.getField(runtime, "states");
        ModuleRuntime.Status ready = states.get("food-lists");
        states.put("food-lists", new ModuleRuntime.Status("food-lists", ready.schema(), false, ModuleRuntime.State.DISABLED, null, null));
        try {
            staff(compliance, id, "complete", 2, "Deleted").andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("ERASE_INCOMPLETE"));
        } finally {
            states.put("food-lists", ready);
        }
        // Rolled back together: consent and the food list still there, request still in progress at the same version.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_taste_data.consent WHERE person_id = ?", Integer.class, person)).isOne();
        mvc.perform(get("/api/v1/advanced/food-lists").header("Authorization", customer)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(ADMIN + "/" + id).header("Authorization", compliance)).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.version").value(2));
        staff(compliance, id, "complete", 2, "Deleted").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        mvc.perform(get("/api/v1/advanced/food-lists").header("Authorization", customer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void selfServiceEraseClearsTheReasonAndAskingIsBoundedPerDay() throws Exception {
        ask(customer, "DELETE", "{\"reason\":\"Private reason\"}").andExpect(status().isCreated());
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", customer).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk());
        mvc.perform(get(BASE).header("Authorization", customer)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.reason").doesNotExist());
        mvc.perform(delete(BASE).header("Authorization", customer)).andExpect(status().isOk());
        for (int i = 1; i < AccountDeletionService.ASKS_PER_DAY; i++) {
            ask(customer, "DELETE", "{}").andExpect(status().isCreated());
            mvc.perform(delete(BASE).header("Authorization", customer)).andExpect(status().isOk());
        }
        ask(customer, "DELETE", "{}").andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("TOO_MANY_DELETION_REQUESTS"));
        CLOCK.advance(Duration.ofHours(23).plusMinutes(59));
        ask(customer, "DELETE", "{}").andExpect(status().isTooManyRequests());
    }

    @Test
    void anAskRacingAnotherReturnsTheOpenRequest() throws Exception {
        CompletableFuture<Object> other = new CompletableFuture<>();
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            jdbc.update("INSERT INTO adv_account_deletion.request (id, person_id, roles, status, version, created_at, updated_at) "
                    + "VALUES (?,?,'CUSTOMER','REQUESTED',1,now(),now())", UUID.randomUUID(), person);
            new Thread(() -> {
                try {
                    other.complete(service.request(person, List.of("CUSTOMER"), null));
                } catch (Throwable failure) {
                    other.complete(failure);
                }
            }).start();
            try {
                Thread.sleep(1500);
            } catch (InterruptedException ex) {
                throw new IllegalStateException(ex);
            }
        });
        Object result = other.get(20, TimeUnit.SECONDS);
        assertThat(result).isInstanceOf(AccountDeletionService.Asked.class);
        assertThat(((AccountDeletionService.Asked) result).created()).isFalse();
    }
}
