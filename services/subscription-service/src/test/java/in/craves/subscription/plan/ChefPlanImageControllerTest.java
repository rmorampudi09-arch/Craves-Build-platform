package in.craves.subscription.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.config.SecurityConfig;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanResponse;
import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.security.JwtVerifier;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@WebMvcTest(ChefPlanWorkflowController.class)
@Import({SecurityConfig.class, CravesJwtAuthenticationFilter.class})
class ChefPlanImageControllerTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID PLAN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final String IMAGE_PATH = "/api/v1/subscriptions/plans/" + PLAN_ID + "/image?v=1790000000";
    private static final String IMAGE_ROUTE = "/api/v1/chef/subscription-plans/{planId}/image";
    private static final String SWITCH_ROUTE = "/api/v1/chef/subscription-plans/{planId}/accepting-subscribers";
    // Unsigned stand-in: the verifier is mocked, but the admin-session interceptor still decodes the roles claim of a three-part token.
    private static final String TOKEN = "e30." + Base64.getUrlEncoder().withoutPadding()
        .encodeToString("{\"roles\":[\"CHEF\"]}".getBytes(StandardCharsets.UTF_8)) + ".signature";
    private static final String BEARER = "Bearer " + TOKEN;
    private static final CurrentUser CHEF = new CurrentUser(CHEF_ID, "firebase-chef", "+919999999999", List.of("CHEF"));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper json;

    @MockBean
    private JwtVerifier jwtVerifier;

    @MockBean
    private ChefPlanWorkflowService workflow;

    @MockBean
    private ChefPlanScheduleService schedules;

    @BeforeEach
    void signInAsChef() {
        when(jwtVerifier.verify(TOKEN)).thenReturn(CHEF);
    }

    @Test
    void multipartUploadHandsTheFileBytesToTheServiceAndReturnsThePlanWithItsImageUrl() throws Exception {
        byte[] bytes = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};
        when(workflow.putImage(eq(PLAN_ID), aryEq(bytes), eq(CHEF))).thenReturn(plan(IMAGE_PATH, true));

        mockMvc.perform(multipart(HttpMethod.PUT, IMAGE_ROUTE, PLAN_ID)
                .file(new MockMultipartFile("file", "dal.png", MediaType.IMAGE_PNG_VALUE, bytes))
                .header("Authorization", BEARER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(PLAN_ID.toString()))
            .andExpect(jsonPath("$.imageUrl").value(IMAGE_PATH))
            .andExpect(jsonPath("$.acceptingSubscribers").value(true));
    }

    @Test
    void uploadWithoutAFilePartIsTreatedAsAnEmptyImage() throws Exception {
        when(workflow.putImage(eq(PLAN_ID), isNull(), eq(CHEF)))
            .thenThrow(ApiException.badRequest("PLAN_IMAGE_SIZE_INVALID", "Plan photo must not be empty"));

        mockMvc.perform(multipart(HttpMethod.PUT, IMAGE_ROUTE, PLAN_ID)
                .file(new MockMultipartFile("other", new byte[] {1}))
                .header("Authorization", BEARER))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PLAN_IMAGE_SIZE_INVALID"));
    }

    @Test
    void uploadAboveTheSpringMultipartLimitIsReportedAsAnInvalidImageSize() throws Exception {
        when(workflow.putImage(eq(PLAN_ID), any(), eq(CHEF))).thenThrow(new MaxUploadSizeExceededException(6L * 1024 * 1024));

        mockMvc.perform(multipart(HttpMethod.PUT, IMAGE_ROUTE, PLAN_ID)
                .file(new MockMultipartFile("file", "big.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[] {1}))
                .header("Authorization", BEARER))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PLAN_IMAGE_SIZE_INVALID"));
    }

    @Test
    void stateConflictsFromTheServiceKeepTheirCode() throws Exception {
        when(workflow.putImage(eq(PLAN_ID), any(), eq(CHEF)))
            .thenThrow(ApiException.conflict("PLAN_NOT_EDITABLE", "Only draft or rejected plans can change their photo"));

        mockMvc.perform(multipart(HttpMethod.PUT, IMAGE_ROUTE, PLAN_ID)
                .file(new MockMultipartFile("file", "dal.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[] {1}))
                .header("Authorization", BEARER))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PLAN_NOT_EDITABLE"));
    }

    @Test
    void uploadAndSwitchRequireASignedInCaller() throws Exception {
        mockMvc.perform(multipart(HttpMethod.PUT, IMAGE_ROUTE, PLAN_ID)
                .file(new MockMultipartFile("file", new byte[] {1})))
            .andExpect(status().is4xxClientError());
        mockMvc.perform(patch(SWITCH_ROUTE, PLAN_ID).contentType(MediaType.APPLICATION_JSON).content("{\"acceptingSubscribers\":false}"))
            .andExpect(status().is4xxClientError());

        verify(workflow, never()).putImage(any(), any(), any());
        verify(workflow, never()).setAcceptingSubscribers(any(), anyBoolean(), any());
    }

    @Test
    void patchSwitchesNewSubscriptionsAndReturnsThePlan() throws Exception {
        when(workflow.setAcceptingSubscribers(PLAN_ID, false, CHEF)).thenReturn(plan(null, false));

        mockMvc.perform(patch(SWITCH_ROUTE, PLAN_ID)
                .header("Authorization", BEARER)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingSubscribers\":false}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.acceptingSubscribers").value(false))
            .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void patchWithoutTheFlagIsAValidationErrorAndNeverReachesTheService() throws Exception {
        mockMvc.perform(patch(SWITCH_ROUTE, PLAN_ID)
                .header("Authorization", BEARER)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        verify(workflow, never()).setAcceptingSubscribers(any(), anyBoolean(), any());
    }

    @Test
    void patchOnAPlanThatIsNotActiveIsAConflict() throws Exception {
        when(workflow.setAcceptingSubscribers(PLAN_ID, true, CHEF))
            .thenThrow(ApiException.conflict("PLAN_NOT_ACTIVE", "Only active meal plans can change whether they accept new subscribers"));

        mockMvc.perform(patch(SWITCH_ROUTE, PLAN_ID)
                .header("Authorization", BEARER)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingSubscribers\":true}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PLAN_NOT_ACTIVE"));
    }

    @Test
    void chefPlanJsonAlwaysCarriesImageUrlAndAcceptingSubscribersKeys() {
        JsonNode node = json.valueToTree(plan(null, true));

        assertThat(node.has("imageUrl")).isTrue();
        assertThat(node.get("imageUrl").isNull()).isTrue();
        assertThat(node.get("acceptingSubscribers").asBoolean()).isTrue();
    }

    private static ChefPlanResponse plan(String imageUrl, boolean acceptingSubscribers) {
        return new ChefPlanResponse(
            PLAN_ID, "MEAL-ABC", "Weekly lunches", "Home lunches", "WEEKLY", new BigDecimal("1200.00"), "INR",
            "ACTIVE", null, null, null, Instant.parse("2026-08-13T00:00:00Z"), Instant.parse("2026-08-13T00:00:00Z"),
            imageUrl, acceptingSubscribers
        );
    }
}
