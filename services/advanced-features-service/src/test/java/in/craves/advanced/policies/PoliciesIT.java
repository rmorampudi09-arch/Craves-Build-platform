package in.craves.advanced.policies;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class PoliciesIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/policies";
    static final String REFUNDS = "{\"document\":{\"rules\":[{\"stage\":\"PLACED\",\"cancelledBy\":\"CUSTOMER\",\"allowed\":true,\"foodRefundPercent\":100,"
            + "\"deliveryFeeRefunded\":true,\"platformFeeRefunded\":true}]},\"note\":\"launch rules\"}";
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM adv_policies.policy_version");
    }

    ResultActions send(String auth, String path, String body) throws Exception {
        return mvc.perform(post(path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void refundRulesNeedASecondAdminAndNothingIsAssumedBeforeThen() throws Exception {
        String customer = bearer(UUID.randomUUID(), "CUSTOMER");
        String check = "{\"orderStatus\":\"PAID\",\"cancelledBy\":\"CUSTOMER\",\"foodPaise\":20000,\"deliveryFeePaise\":3000,\"platformFeePaise\":500,\"paidPaise\":23500}";
        send(customer, BASE + "/cancellation/evaluate", check).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("POLICY_NOT_SET"));

        String drafter = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
        send(bearer(UUID.randomUUID(), "OPERATIONS_ADMIN"), BASE + "/admin/cancellation/versions", REFUNDS).andExpect(status().isForbidden());
        send(drafter, BASE + "/admin/cancellation/versions", "{\"document\":{\"rules\":[],\"extra\":1}}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_POLICY"));
        send(drafter, BASE + "/admin/cancellation/versions", REFUNDS).andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.status").value("DRAFT"));
        send(drafter, BASE + "/admin/cancellation/versions/1/activate", "").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SECOND_PERSON_REQUIRED"));
        send(bearer(UUID.randomUUID(), "PLATFORM_ADMIN"), BASE + "/admin/cancellation/versions/1/activate", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        send(customer, BASE + "/cancellation/evaluate", check).andExpect(status().isOk()).andExpect(jsonPath("$.totalRefundPaise").value(23500))
                .andExpect(jsonPath("$.policyVersion").value(1));
        mvc.perform(get(BASE + "/cancellation/active").header("Authorization", customer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.document.rules[0].foodRefundPercent").value(100));
        mvc.perform(get(BASE + "/admin/cancellation/versions").header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/nonsense/active").header("Authorization", customer)).andExpect(status().isNotFound());
        mvc.perform(get(BASE + "/cancellation/active")).andExpect(status().isUnauthorized());
    }

    @Test
    void aNewVersionRetiresTheOldOneAndEvaluatorsUseIt() throws Exception {
        String ops = bearer(UUID.randomUUID(), "OPERATIONS_ADMIN");
        String user = bearer(UUID.randomUUID(), "CUSTOMER");
        send(ops, BASE + "/admin/serviceability/versions", "{\"document\":{\"maxDistanceMeters\":3000}}").andExpect(status().isCreated());
        send(ops, BASE + "/admin/serviceability/versions/1/activate", "").andExpect(status().isOk());
        String near = "{\"kitchenLatitude\":17.44,\"kitchenLongitude\":78.35,\"customerLatitude\":17.45,\"customerLongitude\":78.36}";
        send(user, BASE + "/serviceability/evaluate", near).andExpect(jsonPath("$.serviceable").value(true));
        send(ops, BASE + "/admin/serviceability/versions", "{\"document\":{\"maxDistanceMeters\":500}}").andExpect(status().isCreated());
        send(ops, BASE + "/admin/serviceability/versions/2/activate", "").andExpect(status().isOk());
        send(ops, BASE + "/admin/serviceability/versions", "{\"document\":{\"maxDistanceMeters\":900}}").andExpect(status().isCreated());
        send(ops, BASE + "/admin/serviceability/versions/1/activate", "").andExpect(status().isConflict());
        send(ops, BASE + "/admin/serviceability/versions", "{\"document\":null}").andExpect(status().isBadRequest());
        send(ops, BASE + "/admin/notification-frequency/versions", "{\"document\":{\"categories\":{\"PROMO\":{\"maxPerDay\":1,\"minGapMinutes\":0}},"
                + "\"quietExemptCategories\":[null]}}").andExpect(status().isBadRequest());
        send(user, BASE + "/serviceability/evaluate", near).andExpect(jsonPath("$.serviceable").value(false)).andExpect(jsonPath("$.reason").value("TOO_FAR"))
                .andExpect(jsonPath("$.policyVersion").value(2));
        send(ops, BASE + "/admin/serviceability/versions", "{\"document\":{\"maxDistanceMeters\":800}}").andExpect(status().isCreated());
        send(ops, BASE + "/admin/serviceability/versions/4/activate", "").andExpect(status().isOk());
        send(ops, BASE + "/admin/serviceability/versions/3/activate", "").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("POLICY_OUTDATED"));
        send(user, BASE + "/serviceability/evaluate", "{\"kitchenLatitude\":91,\"kitchenLongitude\":0,\"customerLatitude\":0,\"customerLongitude\":0}")
                .andExpect(status().isBadRequest());

        send(ops, BASE + "/admin/provider-ranking/versions", "{\"document\":{\"priceWeight\":70,\"etaWeight\":30,\"reliabilityWeight\":0}}").andExpect(status().isCreated());
        send(ops, BASE + "/admin/provider-ranking/versions/1/activate", "").andExpect(status().isOk());
        send(user, BASE + "/provider-ranking/evaluate", "{\"candidates\":[{\"provider\":\"PIDGE\",\"pricePaise\":5000,\"etaMinutes\":20},"
                + "{\"provider\":\"BORZO\",\"pricePaise\":4000,\"etaMinutes\":30}]}").andExpect(jsonPath("$.providers[0].provider").value("BORZO"));

        send(ops, BASE + "/admin/notification-frequency/versions", "{\"document\":{\"categories\":{\"PROMO\":{\"maxPerDay\":1,\"minGapMinutes\":0}}}}")
                .andExpect(status().isCreated());
        send(ops, BASE + "/admin/notification-frequency/versions/1/activate", "").andExpect(status().isOk());
        send(user, BASE + "/notification-frequency/evaluate", "{\"category\":\"PROMO\",\"sentAt\":[\"" + CLOCK.instant().minusSeconds(60) + "\"]}")
                .andExpect(jsonPath("$.allowed").value(false)).andExpect(jsonPath("$.reason").value("DAILY_LIMIT"));
    }
}
