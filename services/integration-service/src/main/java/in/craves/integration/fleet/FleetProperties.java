package in.craves.integration.fleet;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * craves.fleet.* in application.yml. The four flags only switch code paths on and are all off by default.
 * authBaseUrl and internalServiceKey reach auth-service's RIDER grant; without both, no call is made.
 * storageEndpoint and storageContainer are the same settings user-chef-service uses for KYC documents.
 */
@ConfigurationProperties("craves.fleet")
public record FleetProperties(
    boolean enabled,
    boolean riderApiEnabled,
    boolean locationIngestEnabled,
    boolean payoutExecutionEnabled,
    @DefaultValue("true") boolean testMode,
    String authBaseUrl,
    String internalServiceKey,
    String storageEndpoint,
    @DefaultValue("documents") String storageContainer
) {
}
