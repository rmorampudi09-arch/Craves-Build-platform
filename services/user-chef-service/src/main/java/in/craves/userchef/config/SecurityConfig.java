package in.craves.userchef.config;

import in.craves.userchef.security.CravesJwtAuthenticationFilter;
import in.craves.userchef.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http, CravesJwtAuthenticationFilter filter, Environment environment
    ) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(errors -> errors.defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                new AntPathRequestMatcher("/api/v1/chef/application/readiness", "GET")))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers("/internal/v1/customer-addresses/**").permitAll()
                // Kitchen photos of approved chefs only; the controller requires the internal service secret.
                .requestMatchers("/internal/v1/chef-kitchen-photos/**").permitAll()
                // This exact read-only operation verifies a separate short-lived HMAC in its controller.
                .requestMatchers("/internal/v1/chef-bank/identity").permitAll()
                .requestMatchers("/internal/v1/chef-finance/approvals").permitAll()
                // Dedicated Auth email HMAC; never published through a public API product.
                .requestMatchers("/internal/v1/auth-email/projection").permitAll()
                // Support chat for signed-out website visitors: no account data; limits in SupportChatController.
                .requestMatchers(HttpMethod.POST, "/api/v1/support/chat/guest").permitAll()
                // CH-03: metrics and prometheus are not for signed-in customers; only health stays reachable.
                .requestMatchers("/actuator/**").denyAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(InternalCallFilter.fromEnvironment(environment, "/internal/**"), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
