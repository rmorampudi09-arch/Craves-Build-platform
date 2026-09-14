package in.craves.integration.config;

import in.craves.integration.security.CravesJwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/** Isolate applicant access without altering the existing delivery/admin permission chain. */
@Configuration
public class BankOnboardingSecurityConfiguration {
    @Bean
    @Order(1)
    SecurityFilterChain bankApplicantSecurity(HttpSecurity http, CravesJwtAuthenticationFilter filter) throws Exception {
        return http.securityMatcher("/api/v1/chef-onboarding/bank")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a.anyRequest().authenticated())
                .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class).build();
    }
}
