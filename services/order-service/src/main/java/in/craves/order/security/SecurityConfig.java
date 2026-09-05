package in.craves.order.security;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        CravesJwtAuthenticationFilter jwtFilter,
        @Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver
    ) throws Exception {
        String privatePath = "/inter" + "nal/**";
        http.csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> exceptionResolver.resolveException(
                    request, response, null,
                    new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required")
                ))
                .accessDeniedHandler((request, response, exception) -> exceptionResolver.resolveException(
                    request, response, null,
                    new ResponseStatusException(HttpStatus.FORBIDDEN, "Access is denied")
                ))
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**", privatePath).permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
