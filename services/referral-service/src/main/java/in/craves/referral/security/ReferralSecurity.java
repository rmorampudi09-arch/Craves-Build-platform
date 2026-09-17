package in.craves.referral.security;

import in.craves.referral.ReferralSettings;
import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class ReferralSecurity {
    @Bean @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="CRAVES_REFERRALS_AUTH_VERIFICATION_MODE",havingValue="AUTH_HTTP")
    ReferralAuthStateClient referralAuthStateClient(@Value("${CRAVES_REFERRALS_AUTH_BASE_URL:}") String baseUrl) { return new ReferralAuthStateClient(baseUrl); }
    @Bean JwtDecoder referralDecoder(ReferralSettings settings,Clock clock) { return ReferralJwtDecoder.create(settings,clock); }
    @Bean @Order(1) SecurityFilterChain internal(HttpSecurity http,ReferralSettings settings,Clock clock) throws Exception {
        http.securityMatcher("/internal/**").csrf(csrf->csrf.disable()).sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache->cache.disable()).authorizeHttpRequests(auth->auth.anyRequest().authenticated())
            .addFilterBefore(new SourceAuthenticationFilter(settings,clock),UsernamePasswordAuthenticationFilter.class);
        errors(http); return http.build();
    }
    @Bean @Order(2) SecurityFilterChain external(HttpSecurity http,ReferralSettings settings,JwtDecoder decoder,StringRedisTemplate redis,
            @Value("${CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED:false}") boolean publicAccessEnabled,
            @Value("${CRAVES_REFERRALS_REVOCATION_ABSENCE_CONTRACT_CONFIRMED:false}") boolean absenceContractConfirmed,
            @Value("${CRAVES_REFERRALS_AUTH_VERIFICATION_MODE:REDIS}") String verificationMode,
            org.springframework.beans.factory.ObjectProvider<ReferralAuthStateClient> authClients) throws Exception {
        if(!List.of("REDIS","AUTH_HTTP").contains(verificationMode))throw new IllegalArgumentException("Unknown Auth verification mode");
        ReferralAuthStateClient authState="AUTH_HTTP".equals(verificationMode)?authClients.getObject():null;
        http.csrf(csrf->csrf.disable()).sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache->cache.disable()).cors(cors->cors.disable())
            .authorizeHttpRequests(auth->auth
                .requestMatchers("/actuator/health","/actuator/health/liveness","/actuator/health/readiness").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET,"/api/v1/referrals/admin/**").hasAnyRole("PLATFORM_ADMIN","PAYMENTS_ADMIN","AUDIT_ADMIN")
                .requestMatchers("/api/v1/referrals/admin/**").hasAnyRole("PLATFORM_ADMIN","PAYMENTS_ADMIN")
                .requestMatchers("/api/v1/referrals/me","/api/v1/referrals/me/**").authenticated()
                .anyRequest().denyAll())
            .oauth2ResourceServer(oauth->oauth.jwt(jwt->jwt.decoder(decoder).jwtAuthenticationConverter(token->{
                List<String> roles=token.getClaimAsStringList("roles");
                Collection<GrantedAuthority> authorities=roles.stream().map(role->role.toUpperCase(Locale.ROOT))
                    .filter(role->List.of("PLATFORM_ADMIN","PAYMENTS_ADMIN","AUDIT_ADMIN","CHEF","CUSTOMER").contains(role)).distinct()
                    .map(role->(GrantedAuthority)new SimpleGrantedAuthority("ROLE_"+role)).toList();
                return new JwtAuthenticationToken(token,authorities,token.getSubject());
            })).authenticationEntryPoint((req,res,ex)->SourceAuthenticationFilter.error(res,401,"AUTHENTICATION_REQUIRED")))
            .addFilterAfter(new ReferralRevocationFilter(settings,redis,publicAccessEnabled,absenceContractConfirmed,authState),BearerTokenAuthenticationFilter.class);
        errors(http); return http.build();
    }
    private static void errors(HttpSecurity http) throws Exception {
        http.headers(headers->headers.frameOptions(frame->frame.deny()).contentTypeOptions(Customizer.withDefaults()))
            .exceptionHandling(errors->errors.authenticationEntryPoint((req,res,ex)->SourceAuthenticationFilter.error(res,401,"AUTHENTICATION_REQUIRED"))
                .accessDeniedHandler((req,res,ex)->SourceAuthenticationFilter.error(res,403,"ACCESS_DENIED")));
    }
}
