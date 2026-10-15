package in.craves.integration.security.internalcall;

import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

/**
 * CH-03: signs this service's calls to other services' internal routes with its own key, alongside the
 * existing shared-secret header. Off until CRAVES_INTERNAL_AUTH_SERVICE_NAME and CRAVES_INTERNAL_AUTH_SIGNING_KEY are set.
 */
@Configuration(proxyBeanMethods = false)
public class InternalCallSigningConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(InternalCallSigningConfiguration.class);

    @Bean
    RestClientCustomizer internalCallSigning(Environment environment) {
        String caller = environment.getProperty("craves.internal-auth.service-name", "").trim();
        String key = environment.getProperty("craves.internal-auth.signing-key", "").trim();
        if (caller.isEmpty() || key.isEmpty()) {
            return builder -> { };
        }
        try {
            SigningInterceptor interceptor = new SigningInterceptor(caller, InternalCallSignature.decodeKey(key), Clock.systemUTC());
            return builder -> builder.requestInterceptor(interceptor);
        } catch (IllegalArgumentException exception) {
            // A bad key must not stop the service: calls go out unsigned, as before, and the alert says why.
            LOGGER.error("CRAVES_ALERT alert=INTERNAL_CALL_CONFIG_INVALID setting=signing-key reason={}", exception.getMessage());
            return builder -> { };
        }
    }

    static final class SigningInterceptor implements ClientHttpRequestInterceptor {
        private final String caller;
        private final byte[] key;
        private final Clock clock;

        SigningInterceptor(String caller, byte[] key, Clock clock) {
            this.caller = caller;
            this.key = key;
            this.clock = clock;
        }

        @Override
        public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
            URI uri = request.getURI();
            String path = uri.getRawPath();
            if (path != null && path.contains("/internal/")) {
                String pathAndQuery = uri.getRawQuery() == null ? path : path + "?" + uri.getRawQuery();
                InternalCallSignature.sign(
                    caller, key, request.getMethod().name(), pathAndQuery, body, clock.instant(), UUID.randomUUID().toString()
                ).forEach(request.getHeaders()::set);
            }
            return execution.execute(request, body);
        }
    }
}
