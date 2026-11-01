package in.craves.advanced.partneroffers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class PartnerOffersIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/partner-offers";
    @Autowired
    JdbcTemplate jdbc;
    String admin;
    UUID kitchen;
    MenuItem dal;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM adv_partner_offers.claim");
        jdbc.update("DELETE FROM adv_partner_offers.offer");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'partner-offers'");
        admin = bearer(UUID.randomUUID(), "PLATFORM_ADMIN");
        kitchen = UUID.randomUUID();
        dal = CATALOG.add(kitchen, "Dal", 15000);
    }

    ResultActions send(String method, String auth, String path, String body) throws Exception {
        var request = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            default -> throw new IllegalArgumentException(method);
        };
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String draft(String code, Integer limit, Long version) {
        return "{\"partnerName\":\"Brew Co\",\"title\":\"20% off coffee\",\"description\":\"Any coffee at Brew Co\",\"terms\":\"One per person\","
                + "\"linkUrl\":\"https://brew.example/craves\"," + (code == null ? "" : "\"code\":\"" + code + "\",")
                + "\"startsAt\":\"" + CLOCK.instant().minus(Duration.ofHours(1)) + "\",\"endsAt\":\"" + CLOCK.instant().plus(Duration.ofDays(30)) + "\""
                + (limit == null ? "" : ",\"claimLimit\":" + limit) + (version == null ? "" : ",\"expectedVersion\":" + version) + "}";
    }

    String create(String code, Integer limit) throws Exception {
        String body = send("POST", admin, BASE + "/admin/offers", draft(code, limit, null)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT")).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    String live(String code, Integer limit) throws Exception {
        String id = create(code, limit);
        send("POST", admin, BASE + "/admin/offers/" + id + "/activate", "{\"expectedVersion\":1}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        return id;
    }

    @Test
    void staffRunTheLifecycleAndOnlyDraftsChange() throws Exception {
        send("POST", admin, BASE + "/admin/offers", draft(null, null, null).replace("https://brew", "http://brew")).andExpect(status().isBadRequest());
        send("POST", admin, BASE + "/admin/offers", draft(null, null, null).replace("https://brew", "https://@brew")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_OFFER"));
        send("POST", bearer(UUID.randomUUID(), "SUPPORT_ADMIN"), BASE + "/admin/offers", draft(null, null, null)).andExpect(status().isForbidden());
        send("POST", bearer(UUID.randomUUID(), "CUSTOMER"), BASE + "/admin/offers", draft(null, null, null)).andExpect(status().isForbidden());
        String id = create("CRAVES20", 100);
        send("PUT", admin, BASE + "/admin/offers/" + id, draft("CRAVES25", 100, null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VERSION_REQUIRED"));
        send("PUT", admin, BASE + "/admin/offers/" + id, draft("CRAVES25", 100, 9L)).andExpect(status().isPreconditionFailed());
        send("PUT", admin, BASE + "/admin/offers/" + id, draft("CRAVES25", 100, 1L)).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("CRAVES25")).andExpect(jsonPath("$.version").value(2));
        send("POST", admin, BASE + "/admin/offers/" + id + "/pause", "{\"expectedVersion\":2}").andExpect(status().isConflict());
        send("POST", admin, BASE + "/admin/offers/" + id + "/activate", "{\"expectedVersion\":2}").andExpect(status().isOk());
        send("PUT", admin, BASE + "/admin/offers/" + id, draft("CRAVES30", 100, 3L)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OFFER_NOT_DRAFT"));
        send("POST", admin, BASE + "/admin/offers/" + id + "/pause", "{\"expectedVersion\":3}").andExpect(status().isOk());
        send("POST", admin, BASE + "/admin/offers/" + id + "/end", "{\"expectedVersion\":4}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ENDED"));
        send("POST", admin, BASE + "/admin/offers/" + id + "/activate", "{\"expectedVersion\":5}").andExpect(status().isConflict());
        mvc.perform(get(BASE + "/admin/offers").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        Integer audits = jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'partner-offers'", Integer.class);
        assertThat(audits).isEqualTo(5);
    }

    @Test
    void aPaidOrderUnlocksOffersAndAClaimRevealsTheCodeOnce() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        String offer = live("CRAVES20", null);
        String draftId = create("SECRET1", null); // a draft never shows and its code cannot be claimed
        Order order = ORDERS.place(me, kitchen, "DELIVERED", dal, 1);

        mvc.perform(get(BASE + "/orders/" + order.id()).header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].hasCode").value(true))
                .andExpect(jsonPath("$[0].claimed").value(false)).andExpect(jsonPath("$[0].code").doesNotExist());
        String claim = "{\"offerId\":\"" + offer + "\"}";
        send("POST", auth, BASE + "/orders/" + order.id() + "/claims", claim).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("CRAVES20")).andExpect(jsonPath("$.linkUrl").value("https://brew.example/craves"));
        send("POST", auth, BASE + "/orders/" + order.id() + "/claims", claim).andExpect(status().isOk());
        mvc.perform(get(BASE + "/admin/offers/" + offer).header("Authorization", admin)).andExpect(jsonPath("$.claimedCount").value(1));
        mvc.perform(get(BASE + "/orders/" + order.id()).header("Authorization", auth)).andExpect(jsonPath("$[0].claimed").value(true));
        mvc.perform(get(BASE + "/claims").header("Authorization", auth)).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].orderId").value(order.id().toString()));

        send("POST", auth, BASE + "/orders/" + order.id() + "/claims", "{\"offerId\":\"" + draftId + "\"}").andExpect(status().isNotFound());
    }

    @Test
    void ordersThatAreUnpaidUndoneOrSomeoneElsesUnlockNothing() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        String offer = live(null, null);
        String claim = "{\"offerId\":\"" + offer + "\"}";
        Order refunded = ORDERS.place(me, kitchen, "REFUNDED", dal, 1);
        mvc.perform(get(BASE + "/orders/" + refunded.id()).header("Authorization", auth)).andExpect(jsonPath("$.length()").value(0));
        send("POST", auth, BASE + "/orders/" + refunded.id() + "/claims", claim).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_ELIGIBLE"));
        Order theirs = ORDERS.place(UUID.randomUUID(), kitchen, "DELIVERED", dal, 1);
        mvc.perform(get(BASE + "/orders/" + theirs.id()).header("Authorization", auth)).andExpect(status().isNotFound());
        send("POST", auth, BASE + "/orders/" + theirs.id() + "/claims", claim).andExpect(status().isNotFound());
        ORDERS.down = true;
        mvc.perform(get(BASE + "/orders/" + refunded.id()).header("Authorization", auth)).andExpect(status().isServiceUnavailable());
    }

    @Test
    void theClaimLimitHoldsAndPausedOrExpiredOffersCannotBeClaimed() throws Exception {
        String offer = live("ONEONLY", 1);
        String claim = "{\"offerId\":\"" + offer + "\"}";
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        Order a = ORDERS.place(first, kitchen, "PAID", dal, 1);
        Order b = ORDERS.place(second, kitchen, "PAID", dal, 1);
        send("POST", bearer(first, "CUSTOMER"), BASE + "/orders/" + a.id() + "/claims", claim).andExpect(status().isOk());
        mvc.perform(get(BASE + "/orders/" + b.id()).header("Authorization", bearer(second, "CUSTOMER"))).andExpect(jsonPath("$.length()").value(0));
        send("POST", bearer(second, "CUSTOMER"), BASE + "/orders/" + b.id() + "/claims", claim).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OFFER_SOLD_OUT"));

        String other = live(null, null);
        send("POST", admin, BASE + "/admin/offers/" + other + "/pause", "{\"expectedVersion\":2}").andExpect(status().isOk());
        send("POST", bearer(second, "CUSTOMER"), BASE + "/orders/" + b.id() + "/claims", "{\"offerId\":\"" + other + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OFFER_NOT_AVAILABLE"));
        send("POST", admin, BASE + "/admin/offers/" + other + "/activate", "{\"expectedVersion\":3}").andExpect(status().isOk());
        CLOCK.advance(Duration.ofDays(31));
        send("POST", bearer(second, "CUSTOMER"), BASE + "/orders/" + b.id() + "/claims", "{\"offerId\":\"" + other + "\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OFFER_NOT_AVAILABLE"));
    }

    @Test
    void claimsAreExportedAndErasedWhileTheLimitKeepsCounting() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        String offer = live("CRAVES20", 5);
        Order order = ORDERS.place(me, kitchen, "DELIVERED", dal, 1);
        send("POST", auth, BASE + "/orders/" + order.id() + "/claims", "{\"offerId\":\"" + offer + "\"}").andExpect(status().isOk());
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$['partner-offers'].claims[0].code").value("CRAVES20"));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", auth).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk());
        mvc.perform(get(BASE + "/claims").header("Authorization", auth)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(BASE + "/admin/offers/" + offer).header("Authorization", admin)).andExpect(jsonPath("$.claimedCount").value(1));
    }
}
