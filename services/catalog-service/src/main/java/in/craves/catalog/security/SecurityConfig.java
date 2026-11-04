package in.craves.catalog.security;

import in.craves.catalog.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http, CravesJwtAuthenticationFilter jwtFilter, Environment environment
    ) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // A missing or expired token is 401, so the app renews its sign-in instead of reading an empty 403.
            .exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(auth -> auth
                // Spring's error page: without it every server error reached the app as an empty 403.
                .requestMatchers("/error").permitAll()
                // Private calls from the auth-service deletion coordinator: InternalCatalogAuthorizer checks the key in the controller.
                .requestMatchers("/internal/v1/account-erasure/**").permitAll()
                .requestMatchers(
                    "/actuator/health",
                    "/actuator/health/**",
                    "/api/v1/catalog/**",
                    "/api/v1/discovery/**"
                ).permitAll()
                // CH-03: metrics and prometheus are not for signed-in customers; only health stays reachable.
                .requestMatchers("/actuator/**").denyAll()
                .anyRequest().authenticated()
            )
            // CH-03: the internal kitchen read sits under the public catalog path; check the caller identity there too.
            .addFilterBefore(
                InternalCallFilter.fromEnvironment(environment, "/api/v1/catalog/internal/**", "/internal/**"),
                UsernamePasswordAuthenticationFilter.class
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
