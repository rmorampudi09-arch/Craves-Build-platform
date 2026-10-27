package in.craves.integration.fleet.money;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.money.FleetMoneyModels.AdjustmentInput;
import in.craves.integration.fleet.money.FleetMoneyModels.BatchPage;
import in.craves.integration.fleet.money.FleetMoneyModels.CancelBatchInput;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Payout;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutBatch;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Money routes of the ops console: each operation's scoped roles (admin-fleet-v1 x-roles); riders and the legacy ADMIN get nothing. */
@WebMvcTest(FleetMoneyAdminController.class)
@ContextConfiguration(classes = {FleetMoneyAdminController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetMoneyAdminSecurityTest {
    static final String HOLDS = "/api/v1/admin/fleet/holds";
    static final String HOLD = "{\"tripId\":\"" + UUID.randomUUID() + "\",\"reason\":\"Customer says not delivered\",\"releaseOn\":\"2026-10-22\"}";
    @Autowired MockMvc mvc;
    @MockBean FleetEarnings earnings;
    @MockBean FleetPayouts payouts;
    @MockBean JwtVerifier verifier;

    MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    @Test
    void holdsAreReadByPaymentsOperationsAndAuditAndChangedOnlyByPayments() throws Exception {
        when(earnings.holds("ACTIVE")).thenReturn(new HoldPage(List.of()));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(HOLDS), role)).andExpect(status().isOk()).andExpect(jsonPath("$.holds").isArray());
        }
        when(earnings.placeHold(any(), any(), any())).thenReturn(Map.of("holdId", "x"));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN")) {
            mvc.perform(as(post(HOLDS), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(HOLD)).andExpect(status().isCreated());
        }
    }

    @Test
    void everyoneElseIsRefused() throws Exception {
        for (String role : List.of("SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "ADMIN", "RIDER", "CUSTOMER")) {
            mvc.perform(as(get(HOLDS), role)).andExpect(status().isForbidden());
        }
        for (String role : List.of("OPERATIONS_ADMIN", "AUDIT_ADMIN", "SUPPORT_ADMIN")) {
            mvc.perform(as(post(HOLDS), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(HOLD)).andExpect(status().isForbidden());
            mvc.perform(as(post(HOLDS + "/" + UUID.randomUUID() + "/release"), role).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden());
        }
        verifyNoInteractions(earnings);
    }

    @Test
    void changesNeedAnIdempotencyKey() throws Exception {
        mvc.perform(as(post(HOLDS), "PAYMENTS_ADMIN").contentType(MediaType.APPLICATION_JSON).content(HOLD))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        when(earnings.releaseHold(any(), any(), eq(UUID.fromString("44444444-4444-4444-8444-444444444444")))).thenReturn(Map.of("state", "RELEASED"));
        mvc.perform(as(post(HOLDS + "/44444444-4444-4444-8444-444444444444/release"), "PAYMENTS_ADMIN")
            .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("RELEASED"));
    }

    static final String BATCHES = "/api/v1/admin/fleet/payout-batches";
    static final UUID BATCH = UUID.fromString("77777777-7777-4777-8777-777777777777");

    static final String TRIPS = "/api/v1/admin/fleet/trips/";
    static final String CANCEL = "{\"reason\":\"Made for the wrong Monday\",\"notUploaded\":true}";
    static final String ADJUST = "{\"component\":\"drop-km\",\"amountPaise\":-1200,\"reason\":\"The drop was 2.9 km, not 4.2 km\"}";

    static PayoutBatch batch(List<Payout> payouts) {
        return new PayoutBatch(BATCH, "WEEKLY", LocalDate.parse("2026-10-26"), "CREATED", 6700, 1, "Admin +91 98xxxxx210", false,
            Instant.parse("2026-10-26T04:00:00Z"), null, null, null, payouts);
    }

    @Test
    void batchesAreReadByPaymentsAndAuditAndTheListLeavesOutPayouts() throws Exception {
        when(payouts.batches(any())).thenReturn(new BatchPage(List.of(batch(null))));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(BATCHES), role)).andExpect(status().isOk()).andExpect(jsonPath("$.batches[0].status").value("CREATED"))
                .andExpect(jsonPath("$.batches[0].payouts").doesNotExist()).andExpect(jsonPath("$.batches[0].approvedBy").isEmpty());
        }
        for (String role : List.of("OPERATIONS_ADMIN", "SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "RIDER", "ADMIN")) {
            mvc.perform(as(get(BATCHES), role)).andExpect(status().isForbidden());
        }
        when(payouts.batch(any(), eq(BATCH))).thenReturn(batch(List.of(new Payout(UUID.randomUUID(), UUID.randomUUID(), "Ravi Kumar", 6700,
            "xxxxxx9012", "PENDING", null, null, null, null))));
        mvc.perform(as(get(BATCHES + "/" + BATCH), "AUDIT_ADMIN")).andExpect(status().isOk())
            .andExpect(jsonPath("$.payouts[0].maskedAccount").value("xxxxxx9012")).andExpect(jsonPath("$.payouts[0].utr").isEmpty())
            .andExpect(jsonPath("$.payoutDate").value("2026-10-26"));
    }

    @Test
    void onlyPaymentsAdminsMakeApproveSendMarkAndDownloadFiles() throws Exception {
        String key = UUID.randomUUID().toString();
        for (String role : List.of("AUDIT_ADMIN", "OPERATIONS_ADMIN")) {
            mvc.perform(as(post(BATCHES), role).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"WEEKLY\",\"payoutDate\":\"2026-10-26\"}")).andExpect(status().isForbidden());
            mvc.perform(as(get(BATCHES + "/" + BATCH + "/file"), role)).andExpect(status().isForbidden());
            for (String action : List.of("/approve", "/mark-sent")) {
                mvc.perform(as(post(BATCHES + "/" + BATCH + action), role).header("Idempotency-Key", key)).andExpect(status().isForbidden());
            }
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/payouts/" + UUID.randomUUID() + "/utr"), role).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"utr\":\"HDFCN52026102612345\"}")).andExpect(status().isForbidden());
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/payouts/" + UUID.randomUUID() + "/fail"), role).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Account closed\"}")).andExpect(status().isForbidden());
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/payouts/" + UUID.randomUUID() + "/reverse"), role).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"IMPS returned\"}")).andExpect(status().isForbidden());
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/cancel"), role).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON)
                .content(CANCEL)).andExpect(status().isForbidden());
            mvc.perform(as(post(TRIPS + UUID.randomUUID() + "/pay-adjustments"), role).header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(ADJUST)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(payouts);
        verifyNoInteractions(earnings);

        when(payouts.createBatch(any(), any(), any())).thenReturn(batch(List.of()));
        mvc.perform(as(post(BATCHES), "PAYMENTS_ADMIN").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON)
            .content("{\"kind\":\"WEEKLY\",\"payoutDate\":\"2026-10-26\"}")).andExpect(status().isCreated());
        when(payouts.approve(any(), any(), eq(BATCH))).thenThrow(new FleetApiException(403, "SAME_APPROVER",
            "You made this payout file, so another payments admin must approve it."));
        mvc.perform(as(post(BATCHES + "/" + BATCH + "/approve"), "PAYMENTS_ADMIN").header("Idempotency-Key", key))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SAME_APPROVER"));
        when(payouts.file(any(), eq(BATCH))).thenReturn(new FileContent("text/csv; charset=UTF-8",
            "payoutId,holderName,accountOrUpiId,ifsc,amountRupees\r\n".getBytes(StandardCharsets.UTF_8)));
        mvc.perform(as(get(BATCHES + "/" + BATCH + "/file"), "PAYMENTS_ADMIN")).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store")).andExpect(header().string("Content-Type", "text/csv; charset=UTF-8"))
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"rider-payouts-" + BATCH + ".csv\""))
            .andExpect(content().string("payoutId,holderName,accountOrUpiId,ifsc,amountRupees\r\n"));
    }

    @Test
    void paymentsAdminsCancelAnUnsentFileRecordABankReversalAndAdjustATripsPay() throws Exception {
        UUID payout = UUID.randomUUID();
        UUID trip = UUID.randomUUID();
        when(payouts.cancelBatch(any(), any(), eq(BATCH), eq(new CancelBatchInput("Made for the wrong Monday", true))))
            .thenReturn(Map.of("payoutCount", 1));
        when(payouts.reverse(any(), any(), eq(BATCH), eq(payout), eq("IMPS returned"))).thenReturn(Map.of("state", "FAILED"));
        when(earnings.adjustTrip(any(), any(), eq(trip), eq(new AdjustmentInput("drop-km", -1200L, "The drop was 2.9 km, not 4.2 km"))))
            .thenReturn(Map.of("revision", 2));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN")) {
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/cancel"), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(CANCEL)).andExpect(status().isOk()).andExpect(jsonPath("$.payoutCount").value(1));
            mvc.perform(as(post(BATCHES + "/" + BATCH + "/payouts/" + payout + "/reverse"), role)
                .header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"IMPS returned\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("FAILED"));
            mvc.perform(as(post(TRIPS + trip + "/pay-adjustments"), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(ADJUST)).andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(2));
        }
        mvc.perform(as(post(BATCHES + "/" + BATCH + "/cancel"), "PAYMENTS_ADMIN").contentType(MediaType.APPLICATION_JSON).content(CANCEL))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
    }
}
