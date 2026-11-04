package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class CorrelationIdConfigurationTest {
    private static final String ID = "3f2b8c1e-5d4a-4b6f-9e0a-1c2d3e4f5a6b";
    private static final String HEADER = CorrelationIdConfiguration.HEADER;
    private final CorrelationIdConfiguration configuration = new CorrelationIdConfiguration();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void createsAnIdWhenTheCallerSentNoneAndControllersReadTheSameId() throws Exception {
        AtomicReference<String> logged = new AtomicReference<>();
        AtomicReference<String> controllerSees = new AtomicReference<>();
        MockHttpServletResponse response = run(new MockHttpServletRequest(), (req, res) -> {
            logged.set(MDC.get(CorrelationIdConfiguration.MDC_KEY));
            controllerSees.set(((HttpServletRequest) req).getHeader(HEADER));
            assertThat(Collections.list(((HttpServletRequest) req).getHeaders("x-correlation-id"))).containsExactly(logged.get());
            assertThat(Collections.list(((HttpServletRequest) req).getHeaderNames())).contains(HEADER);
        });

        assertThat(logged.get()).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
        assertThat(controllerSees.get()).isEqualTo(logged.get());
        assertThat(response.getHeaders(HEADER)).containsExactly(logged.get());
        assertThat(MDC.get(CorrelationIdConfiguration.MDC_KEY)).isNull();
    }

    @Test
    void keepsTheCallersUuidInLowerCase() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HEADER, ID.toUpperCase());
        AtomicReference<String> logged = new AtomicReference<>();

        MockHttpServletResponse response = run(request, (req, res) -> logged.set(MDC.get(CorrelationIdConfiguration.MDC_KEY)));

        assertThat(logged.get()).isEqualTo(ID);
        assertThat(response.getHeaders(HEADER)).containsExactly(ID);
    }

    @Test
    void logsANewIdForAnythingThatIsNotAUuidButLetsControllersSeeWhatWasSent() throws Exception {
        for (String supplied : new String[] {"abc-123456789", ID + "x", "1-2-3-4-5", " " + ID}) {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader(HEADER, supplied);
            AtomicReference<String> logged = new AtomicReference<>();
            AtomicReference<String> controllerSees = new AtomicReference<>();

            MockHttpServletResponse response = run(request, (req, res) -> {
                logged.set(MDC.get(CorrelationIdConfiguration.MDC_KEY));
                controllerSees.set(((HttpServletRequest) req).getHeader(HEADER));
            });

            assertThat(logged.get()).isNotEqualTo(supplied).hasSize(36);
            assertThat(controllerSees.get()).isEqualTo(supplied);
            assertThat(response.getHeaders(HEADER)).containsExactly(logged.get());
        }
    }

    @Test
    void aControllersOwnIdReplacesTheFiltersInsteadOfAddingASecondHeader() throws Exception {
        MockHttpServletResponse response = run(new MockHttpServletRequest(),
            (req, res) -> ((HttpServletResponse) res).addHeader(HEADER, ID));

        assertThat(response.getHeaders(HEADER)).containsExactly(ID);
    }

    @Test
    void sendsTheIdOnlyToCravesServicesWhileARequestRunsAndNeverOverridesTheCaller() {
        RestClient.Builder builder = RestClient.builder();
        configuration.correlationIdPropagation().customize(builder);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.craves.in/api/v1/catalog/x")).andExpect(header(HEADER, ID)).andRespond(withSuccess());
        server.expect(requestTo("http://ca-craves-order-prod/internal/x")).andExpect(header(HEADER, ID)).andRespond(withSuccess());
        server.expect(requestTo("https://api.razorpay.com/v1/orders")).andExpect(headerDoesNotExist(HEADER)).andRespond(withSuccess());
        server.expect(requestTo("https://api.craves.in/explicit"))
            .andExpect(header(HEADER, "11111111-2222-3333-4444-555555555555")).andRespond(withSuccess());
        server.expect(requestTo("https://api.craves.in/worker")).andExpect(headerDoesNotExist(HEADER)).andRespond(withSuccess());
        RestClient client = builder.build();

        MDC.put(CorrelationIdConfiguration.MDC_KEY, ID);
        client.get().uri("https://api.craves.in/api/v1/catalog/x").retrieve().toBodilessEntity();
        client.get().uri("http://ca-craves-order-prod/internal/x").retrieve().toBodilessEntity();
        client.post().uri("https://api.razorpay.com/v1/orders").retrieve().toBodilessEntity();
        client.get().uri("https://api.craves.in/explicit")
            .header(HEADER, "11111111-2222-3333-4444-555555555555").retrieve().toBodilessEntity();
        MDC.remove(CorrelationIdConfiguration.MDC_KEY);
        client.get().uri("https://api.craves.in/worker").retrieve().toBodilessEntity();

        server.verify();
    }

    @Test
    void cravesHostsAreOurOwnOnly() {
        assertThat(CorrelationIdConfiguration.cravesHost("api.craves.in")).isTrue();
        assertThat(CorrelationIdConfiguration.cravesHost("ca-craves-catalog-prod.internal.blue-1.centralindia.azurecontainerapps.io")).isTrue();
        assertThat(CorrelationIdConfiguration.cravesHost("localhost")).isTrue();
        assertThat(CorrelationIdConfiguration.cravesHost("api.cashfree.com")).isFalse();
        assertThat(CorrelationIdConfiguration.cravesHost("robot-api.borzodelivery.com")).isFalse();
        assertThat(CorrelationIdConfiguration.cravesHost("notcraves.in")).isFalse();
        assertThat(CorrelationIdConfiguration.cravesHost(null)).isFalse();
    }

    @Test
    void onByDefaultAndOffWithTheSwitch() {
        ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(CorrelationIdConfiguration.class);

        runner.run(context -> assertThat(context).hasSingleBean(RestClientCustomizer.class));
        runner.withPropertyValues("CRAVES_CORRELATION_ID_ENABLED=false")
            .run(context -> assertThat(context).doesNotHaveBean(RestClientCustomizer.class));
    }

    private MockHttpServletResponse run(MockHttpServletRequest request, FilterChain chain) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        configuration.correlationIdFilter().getFilter().doFilter(request, response, chain);
        return response;
    }
}
