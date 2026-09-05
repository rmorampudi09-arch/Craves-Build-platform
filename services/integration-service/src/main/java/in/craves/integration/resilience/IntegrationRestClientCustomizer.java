package in.craves.integration.resilience;

import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class IntegrationRestClientCustomizer implements RestClientCustomizer {
    private final IntegrationHttpClientProperties properties;

    public IntegrationRestClientCustomizer(IntegrationHttpClientProperties properties) {
        this.properties = properties;
    }

    @Override
    public void customize(RestClient.Builder restClientBuilder) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getConnectTimeoutSeconds() * 1000);
        requestFactory.setReadTimeout(properties.getReadTimeoutSeconds() * 1000);
        restClientBuilder.requestFactory(requestFactory);
    }
}
