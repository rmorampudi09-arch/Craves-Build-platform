package in.craves.order.idempotency;

import in.craves.order.security.CravesPrincipal;
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

    // Excluded by default: admin routes, and routes that already handle their own Idempotency-Key
    // (scheduled-order create; chef accept/reject/ready, which the web app already sends a key to).
    @Bean
    FilterRegistrationBean<IdempotencyKeyFilter> idempotencyKeyFilterRegistration(
        JdbcTemplate jdbcTemplate,
        @Value("${craves.idempotency.enabled:true}") boolean enabled,
        @Value("${craves.idempotency.table:order_schema.idempotency_record}") String table,
        @Value("${craves.idempotency.excluded-paths:/api/v1/admin/**,/api/v1/checkouts/*/schedule,/api/v1/chef/orders/**}") String excludedPaths
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
