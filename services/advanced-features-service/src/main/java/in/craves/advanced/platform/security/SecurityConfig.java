package in.craves.advanced.platform.security;

import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.module.FeatureModule;
import in.craves.advanced.platform.web.ErrorBody;
import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    JwtDecoder jwtDecoder(AdvancedSettings settings, Clock clock) {
        return CravesJwt.decoder(settings.verificationPemBase64(), settings.jwtIssuer(), settings.jwtAudience(), clock);
    }

    @Bean
    SecurityFilterChain api(HttpSecurity http, JwtDecoder decoder, List<FeatureModule> modules,
                            @Value("${advanced.api-docs-enabled:false}") boolean apiDocs) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(cors -> cors.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/v1/advanced/features").permitAll();
                    // Only the contract generator in tests turns this on; production has no OpenAPI endpoint at all.
                    if (apiDocs) auth.requestMatchers(HttpMethod.GET, "/v3/api-docs/**").permitAll();
                    for (FeatureModule module : modules) {
                        module.publicGetPaths().forEach(path -> auth.requestMatchers(HttpMethod.GET, path).permitAll());
                        module.publicPostPaths().forEach(path -> auth.requestMatchers(HttpMethod.POST, path).permitAll());
                    }
                    auth.requestMatchers("/api/v1/**").authenticated();
                    auth.anyRequest().denyAll();
                })
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.decoder(decoder).jwtAuthenticationConverter(token -> {
                            List<String> claimed = token.getClaimAsStringList("roles");
                            Collection<GrantedAuthority> authorities = (claimed == null ? List.<String>of() : claimed).stream()
                                    .map(role -> role.toUpperCase(Locale.ROOT)).filter(Roles.KNOWN::contains).distinct()
                                    .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role)).toList();
                            return new JwtAuthenticationToken(token, authorities, token.getSubject());
                        }))
                        .authenticationEntryPoint((request, response, ex) ->
                                ErrorBody.write(request, response, 401, "AUTHENTICATION_REQUIRED", "A valid Bearer access token is required")))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, ex) ->
                                ErrorBody.write(request, response, 401, "AUTHENTICATION_REQUIRED", "A valid Bearer access token is required"))
                        .accessDeniedHandler((request, response, ex) ->
                                ErrorBody.write(request, response, 403, "ACCESS_DENIED", "Your account cannot do this")))
                .headers(headers -> headers.frameOptions(frame -> frame.deny()).contentTypeOptions(Customizer.withDefaults()));
        return http.build();
    }
}
