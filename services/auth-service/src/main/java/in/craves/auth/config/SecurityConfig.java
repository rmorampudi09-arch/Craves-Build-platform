package in.craves.auth.config;

import in.craves.auth.security.CravesJwtAuthenticationFilter;
import in.craves.auth.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http, CravesJwtAuthenticationFilter filter, Environment environment
    ) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                // Auth APIs verify their own Firebase/Craves tokens. Internal routes: InternalCallFilter checks the
                // caller identity, then each route's shared secret still applies.
                .requestMatchers("/api/**", "/internal/**", "/error").permitAll()
                // CH-03: deny by default, so a new route or actuator endpoint is never public by accident.
                .anyRequest().denyAll()
            )
            .addFilterBefore(InternalCallFilter.fromEnvironment(environment, "/internal/**"), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
