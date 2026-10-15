package in.craves.integration.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Connect and read timeouts for every RestClient built from Spring's RestClient.Builder (CH-01).
 * Clients that already set their own request factory keep it, because they override this one.
 * The read default stays above a Container Apps cold start; set CRAVES_HTTP_CLIENT_READ_TIMEOUT=5s
 * once the called services keep a warm replica.
 */
@Configuration(proxyBeanMethods = false)
public class HttpClientTimeoutConfiguration {

    @Bean
    RestClientCustomizer outboundHttpTimeouts(
        @Value("${craves.http-client.connect-timeout:2s}") Duration connectTimeout,
        @Value("${craves.http-client.read-timeout:30s}") Duration readTimeout
    ) {
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
            .withConnectTimeout(connectTimeout)
            .withReadTimeout(readTimeout);
        return builder -> builder.requestFactory(ClientHttpRequestFactories.get(settings));
    }
}
