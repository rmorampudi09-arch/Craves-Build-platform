package in.craves.subscription.config;

import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private static final RegexRequestMatcher ORDER_INTERNAL_CALLBACKS = new RegexRequestMatcher(
        "^/internal/v1/subscription-occurrences/[^/]+/order-(created|declined)$",
        HttpMethod.POST.name()
    );

    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http, CravesJwtAuthenticationFilter filter, Environment environment
    ) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/subscriptions/plans", "/api/v1/subscriptions/plans/**").permitAll()
                .requestMatchers(ORDER_INTERNAL_CALLBACKS).permitAll()
                // CH-03: metrics and prometheus are not for signed-in customers; only health stays reachable.
                .requestMatchers("/actuator/**").denyAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(InternalCallFilter.fromEnvironment(environment, "/internal/**"), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
