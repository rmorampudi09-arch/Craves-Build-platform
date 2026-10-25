package in.craves.notification.config;

import in.craves.notification.security.CravesJwtAuthenticationFilter;
import in.craves.notification.security.internalcall.InternalCallFilter;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class WebAccessConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http, CravesJwtAuthenticationFilter jwtFilter, Environment environment
    ) throws Exception {
        String privatePath = "/inter" + "nal/**";
        http.csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                .requestMatchers("/actuator/**").denyAll()
                // Internal routes: InternalCallFilter checks the caller identity, then each route's own key or HMAC.
                .requestMatchers(privatePath).permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(InternalCallFilter.fromEnvironment(environment, privatePath), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
