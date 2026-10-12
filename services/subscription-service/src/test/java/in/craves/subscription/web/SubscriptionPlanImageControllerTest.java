package in.craves.subscription.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.config.SecurityConfig;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.CustomerOccurrenceResponse;
import in.craves.subscription.lifecycle.SubscriptionLifecycleService;
import in.craves.subscription.plan.PlanImageRepository.PlanImage;
import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.JwtVerifier;
import in.craves.subscription.service.SubscriptionService;
import in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse;
import in.craves.subscription.web.ApiDtos.PublicPlanResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SubscriptionController.class)
@Import({SecurityConfig.class, CravesJwtAuthenticationFilter.class})
class SubscriptionPlanImageControllerTest {
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final String IMAGE_PATH = "/api/v1/subscriptions/plans/" + PLAN_ID + "/image?v=1790000000";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper json;

    @MockBean
    private JwtVerifier jwtVerifier;

    @MockBean
    private SubscriptionService service;

    @MockBean
    private SubscriptionLifecycleService lifecycleService;

    @Test
    void publicPlanListSerializesImageUrlAsNullWhenThePlanHasNoImage() throws Exception {
        when(service.listActivePlans(null, null)).thenReturn(List.of(publicPlan(null)));

        mockMvc.perform(get("/api/v1/subscriptions/plans"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Weekly meals"))
            .andExpect(content().string(containsString("\"imageUrl\":null")));
    }

    @Test
    void publicPlanListCarriesTheVersionedImagePath() throws Exception {
        when(service.listActivePlans(null, null)).thenReturn(List.of(publicPlan(IMAGE_PATH)));

        mockMvc.perform(get("/api/v1/subscriptions/plans"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].imageUrl").value(IMAGE_PATH));
    }

    @Test
    void planImageIsPublicWithStoredContentTypeAndDayLongCache() throws Exception {
        byte[] bytes = {1, 2, 3, 4};
        when(service.getPlanImage(PLAN_ID)).thenReturn(new PlanImage("image/webp", bytes));

        mockMvc.perform(get("/api/v1/subscriptions/plans/{planId}/image", PLAN_ID))
            .andExpect(status().isOk())
            .andExpect(content().contentType("image/webp"))
            .andExpect(header().string("Cache-Control", "public, max-age=86400"))
            .andExpect(content().bytes(bytes));
    }

    @Test
    void missingPlanImageIsNotFoundWithTheDocumentedCode() throws Exception {
        when(service.getPlanImage(PLAN_ID))
            .thenThrow(ApiException.notFound("PLAN_IMAGE_NOT_FOUND", "Subscription plan image was not found"));

        mockMvc.perform(get("/api/v1/subscriptions/plans/{planId}/image", PLAN_ID))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("PLAN_IMAGE_NOT_FOUND"));
    }

    @Test
    void customerSubscriptionJsonCarriesPlanSummaryAndBillingDate() {
        JsonNode node = json.valueToTree(new CustomerSubscriptionResponse(
            UUID.randomUUID(), PLAN_ID, "ACTIVE", LocalDate.parse("2026-10-12"), null,
            LocalDate.parse("2026-10-12"), UUID.randomUUID(), null, Instant.now(), Instant.now(),
            "Weekly meals", "WEEKLY", new BigDecimal("1200.00"), "INR", null, null
        ));

        assertThat(node.get("planName").asText()).isEqualTo("Weekly meals");
        assertThat(node.get("billingPeriod").asText()).isEqualTo("WEEKLY");
        assertThat(node.get("amount").decimalValue()).isEqualByComparingTo("1200.00");
        assertThat(node.get("currency").asText()).isEqualTo("INR");
        assertThat(node.has("nextBillingDate")).isTrue();
        assertThat(node.get("nextBillingDate").isNull()).isTrue();
        assertThat(node.has("planImageUrl")).isTrue();
        assertThat(node.get("planImageUrl").isNull()).isTrue();
    }

    @Test
    void occurrenceJsonCarriesTheOrderLink() {
        UUID orderId = UUID.randomUUID();
        JsonNode node = json.valueToTree(new CustomerOccurrenceResponse(
            UUID.randomUUID(), LocalDate.parse("2026-10-12"), "LUNCH", Instant.now(), "ORDER_CREATED", List.of(), orderId
        ));

        assertThat(node.get("orderId").asText()).isEqualTo(orderId.toString());
    }

    private static PublicPlanResponse publicPlan(String imageUrl) {
        return new PublicPlanResponse(
            PLAN_ID, "WEEKLY-01", "Weekly meals", null, "WEEKLY", new BigDecimal("1200.00"), "INR", imageUrl
        );
    }
}
