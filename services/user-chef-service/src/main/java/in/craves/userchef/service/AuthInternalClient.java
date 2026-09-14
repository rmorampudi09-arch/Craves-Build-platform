package in.craves.userchef.service;

import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.ApiException;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class AuthInternalClient {
    private static final String INTERNAL_SECRET_HEADER = "X-Craves-Internal-Secret";

    private final AuthInternalClientProperties properties;
    private final RestClient.Builder restClientBuilder;
    private final in.craves.userchef.email.AuthEmailHttp emailHttp = new in.craves.userchef.email.AuthEmailHttp();

    public AuthInternalClient(AuthInternalClientProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClientBuilder = restClientBuilder;
    }

    public void grantChefRole(UUID identityId, UUID sourceApplicationId) {
        if (!StringUtils.hasText(properties.getAuthServiceBaseUrl())) {
            throw new ApiException(500, "AUTH_INTERNAL_URL_NOT_CONFIGURED", "Auth internal base URL is not configured");
        }
        if (!StringUtils.hasText(properties.getServiceSecret())) {
            throw new ApiException(500, "AUTH_INTERNAL_SECRET_NOT_CONFIGURED", "Internal service secret is not configured");
        }

        RestClient client = restClientBuilder
            .baseUrl(properties.getAuthServiceBaseUrl())
            .defaultHeader(INTERNAL_SECRET_HEADER, properties.getServiceSecret())
            .build();

        try {
            client.post()
                .uri("/internal/v1/roles/chef/grant")
                .contentType(MediaType.APPLICATION_JSON)
                .body(new GrantChefRoleRequest(identityId, sourceApplicationId))
                .retrieve()
                .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            throw new ApiException(502, "AUTH_INTERNAL_ROLE_GRANT_FAILED", "Auth Service rejected chef role grant: HTTP " + ex.getStatusCode().value());
        } catch (RestClientException ex) {
            throw new ApiException(502, "AUTH_INTERNAL_ROLE_GRANT_FAILED", "Auth Service chef role grant failed");
        }
    }

    /** Chef/profile writes resolve the authenticated identity, never a caller supplied verification flag. */
    public String requireVerifiedEmail(UUID identityId, String suppliedEmail) {
        if (identityId == null || suppliedEmail == null || suppliedEmail.isBlank()) throw emailRequired();
        if (!StringUtils.hasText(properties.getAuthServiceBaseUrl()) || !StringUtils.hasText(properties.getServiceSecret()))
            throw new ApiException(503, "EMAIL_AUTHORITY_UNAVAILABLE", "Email verification is temporarily unavailable");
        try {
            java.net.URI origin = java.net.URI.create(properties.getAuthServiceBaseUrl());
            if (!"https".equalsIgnoreCase(origin.getScheme()) || origin.getHost() == null || origin.getUserInfo() != null ||
                origin.getQuery() != null || origin.getFragment() != null || (origin.getPath() != null && !origin.getPath().isEmpty() && !"/".equals(origin.getPath())))
                throw new IllegalArgumentException();
            var reply = emailHttp.get(origin.resolve("/internal/v1/identities/" + identityId + "/email"), properties.getServiceSecret());
            if (reply.statusCode() != 200) throw new ApiException(503, "EMAIL_AUTHORITY_UNAVAILABLE", "Email verification is temporarily unavailable");
            byte[] body = reply.body();
            InternalIdentityEmail response;
            try { response = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()
                .disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(body, InternalIdentityEmail.class); }
            finally { java.util.Arrays.fill(body, (byte) 0); }
            return canonicalEmail(identityId, suppliedEmail, response);
        } catch (ApiException ex) { throw ex; }
        catch (Exception ex) { throw new ApiException(503, "EMAIL_AUTHORITY_UNAVAILABLE", "Email verification is temporarily unavailable"); }
    }
    static String canonicalEmail(UUID identityId, String suppliedEmail, InternalIdentityEmail response) {
        if (response == null || identityId == null || suppliedEmail == null || !identityId.equals(response.identityId()) ||
            !"ACTIVE".equals(response.status()) || !response.emailVerified() ||
            !in.craves.userchef.email.AuthEmailProjectionService.validEmail(response.email()) ||
            !response.email().equalsIgnoreCase(suppliedEmail.trim())) throw emailRequired();
        return response.email();
    }
    private static ApiException emailRequired() {
        return ApiException.conflict("EMAIL_VERIFICATION_REQUIRED", "Verify this email before continuing");
    }
    record InternalIdentityEmail(UUID identityId, String email, boolean emailVerified, String status,
        long emailRevision, java.time.Instant verifiedAt) {
        @Override public String toString() { return "InternalIdentityEmail[REDACTED]"; }
    }

    private record GrantChefRoleRequest(UUID identityId, UUID sourceApplicationId) {
    }
}
