package in.craves.integration.config;

import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class WebSecurityConfiguration {
    @Bean
    public SecurityFilterChain integrationSecurityFilterChain(
        HttpSecurity http,
        CravesJwtAuthenticationFilter jwtFilter,
        Environment environment
    ) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/admin/operations/delivery-intelligence/**").hasAnyRole(
                    "ADMIN", "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"
                )
                // Rider fleet ops console: COMPLIANCE_ADMIN reads riders too; FleetAdminController checks each operation's roles.
                .requestMatchers("/api/v1/admin/fleet/**").hasAnyRole(
                    "PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN"
                )
                .requestMatchers("/api/v1/admin/**").hasAnyRole(
                    "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"
                )
                .requestMatchers("/api/v1/chef/**").hasRole("CHEF")
                // The native location service sends a shift credential instead of a JWT, here only: the controller
                // requires that credential or a RIDER JWT. The credential authenticates nothing else.
                .requestMatchers(HttpMethod.POST, "/api/v1/rider/locations").permitAll()
                // Any signed-in user may ask whether they are a rider; every other rider route needs RIDER.
                .requestMatchers("/api/v1/rider/me").authenticated()
                .requestMatchers("/api/v1/rider/**").hasRole("RIDER")
                // Payment, webhook and readiness APIs keep their in-controller checks. Internal routes: InternalCallFilter
                // checks the caller identity, then each route's shared secret or HMAC still applies.
                .requestMatchers("/api/**", "/internal/**", "/error").permitAll()
                .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                // CH-03: deny by default, so a new route or actuator endpoint is never public by accident.
                .anyRequest().denyAll()
            )
            .addFilterBefore(InternalCallFilter.fromEnvironment(environment, "/internal/**"), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
