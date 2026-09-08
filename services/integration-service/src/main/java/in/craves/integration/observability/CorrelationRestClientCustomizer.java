package in.craves.integration.observability;

import org.slf4j.MDC;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class CorrelationRestClientCustomizer implements RestClientCustomizer {
    @Override
    public void customize(RestClient.Builder restClientBuilder) {
        restClientBuilder.requestInterceptor((request, body, execution) -> {
            String correlationId = MDC.get(RequestCorrelationFilter.MDC_KEY);
            if (StringUtils.hasText(correlationId)) {
                request.getHeaders().set(RequestCorrelationFilter.HEADER_NAME, correlationId);
            }
            return execution.execute(request, body);
        });
    }
}
