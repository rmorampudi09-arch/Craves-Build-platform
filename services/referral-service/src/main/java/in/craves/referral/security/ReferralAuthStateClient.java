package in.craves.referral.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.referral.ReferralProblem;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Semaphore;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.RestClient;
import static in.craves.referral.ReferralProblem.require;

/** No positive cache, redirects or fallback: Auth owns account/session/role revocation. */
public final class ReferralAuthStateClient {
    private final RestClient http;
    private final URI endpoint;
    private final ObjectMapper json=new ObjectMapper();
    private final Semaphore concurrent=new Semaphore(16);
    public ReferralAuthStateClient(String baseUrl) { this(baseUrl,builder()); }
    ReferralAuthStateClient(String baseUrl, RestClient.Builder builder) {
        URI base=URI.create(baseUrl);
        if(!"https".equals(base.getScheme()) || base.getHost()==null || base.getUserInfo()!=null
                || base.getQuery()!=null || base.getFragment()!=null || !(base.getPath().isEmpty() || "/".equals(base.getPath())))
            throw new IllegalArgumentException("Auth verification requires a configured HTTPS origin");
        endpoint=base.resolve("/api/v1/auth/referrals/access");
        http=builder.build();
    }
    private static RestClient.Builder builder() {
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(2));
        return RestClient.builder().requestFactory(factory);
    }
    public Set<String> verify(Jwt jwt) {
        require(concurrent.tryAcquire(),503,"AUTH_VERIFICATION_BUSY");
        try {
            return http.get().uri(endpoint).header("Authorization","Bearer "+jwt.getTokenValue())
                .header("Accept","application/json").exchange((request,response)->{
                    int status=response.getStatusCode().value();
                    require(status!=401 && status!=403,401,"ACCESS_TOKEN_REVOKED");
                    require(status==200,503,"AUTH_VERIFICATION_UNAVAILABLE");
                    byte[] body=response.getBody().readNBytes(16385);
                    require(body.length<=16384,503,"INVALID_AUTH_VERIFICATION");
                    return verifyResponse(json.readTree(body),jwt);
                });
        } catch(ReferralProblem ex) { throw ex; }
        catch(Exception ex) { throw new ReferralProblem(503,"AUTH_VERIFICATION_UNAVAILABLE"); }
        finally { concurrent.release(); }
    }
    static Set<String> verifyResponse(JsonNode body,Jwt jwt) {
        require(body!=null && body.isObject() && body.size()==4
            && body.path("userId").isTextual() && body.path("userId").asText().equals(jwt.getSubject())
            && body.path("tokenVersion").isIntegralNumber() && body.path("tokenVersion").canConvertToLong()
            && body.path("tokenVersion").longValue()==((Number)jwt.getClaims().get("token_version")).longValue()
            && body.path("status").asText().equals("ACTIVE") && body.path("roles").isArray(),503,"INVALID_AUTH_VERIFICATION");
        Set<String> roles=new HashSet<>();
        for(JsonNode role:body.path("roles")) {
            require(role.isTextual() && role.asText().matches("[A-Z_]{1,64}")
                && jwt.getClaimAsStringList("roles").contains(role.asText()),503,"INVALID_AUTH_VERIFICATION");
            roles.add("ROLE_"+role.asText());
        }
        return Set.copyOf(roles);
    }
}
