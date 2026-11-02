package in.craves.integration.idempotency;

import in.craves.integration.security.CravesPrincipal;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** CH-07: registers the Idempotency-Key filter right after Spring Security, so the caller's identity is known. */
@Configuration(proxyBeanMethods = false)
public class IdempotencyConfiguration {

    // Rider trip steps handle their own Idempotency-Key (FleetTripService.requestHash): every retry sends the tap again,
    // aged (ageMs), so this filter's raw-body fingerprint would refuse the retry of a step whose answer was lost.
    @Bean
    FilterRegistrationBean<IdempotencyKeyFilter> idempotencyKeyFilterRegistration(
        JdbcTemplate jdbcTemplate,
        @Value("${craves.idempotency.enabled:true}") boolean enabled,
        @Value("${craves.idempotency.table:payment_schema.idempotency_record}") String table,
        @Value("${craves.idempotency.excluded-paths:/api/v1/admin/**,/api/v1/webhooks/**,/api/v1/payments/webhooks/**,/api/v1/chef-onboarding/**,/api/v1/rider/trips/**}") String excludedPaths
    ) {
        List<String> excluded = Arrays.stream(excludedPaths.split(",")).map(String::trim).filter(path -> !path.isEmpty()).toList();
        FilterRegistrationBean<IdempotencyKeyFilter> registration =
            new FilterRegistrationBean<>(new IdempotencyKeyFilter(jdbcTemplate, table, excluded,
                // The identity id, not getName(): the principal's toString also carries roles, whose order can change.
                authentication -> authentication.getPrincipal() instanceof CravesPrincipal principal
                    && principal.identityId() != null ? principal.identityId().toString() : null));
        registration.setName("idempotencyKeyFilter");
        registration.addUrlPatterns("/api/*");
        registration.setOrder(SecurityProperties.DEFAULT_FILTER_ORDER + 10);
        registration.setEnabled(enabled);
        return registration;
    }
}
