package in.craves.integration.fleet;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** craves.fleet.* in application.yml. The four flags only switch code paths on and are all off by default. */
@ConfigurationProperties("craves.fleet")
public record FleetProperties(
    boolean enabled,
    boolean riderApiEnabled,
    boolean locationIngestEnabled,
    boolean payoutExecutionEnabled,
    @DefaultValue("true") boolean testMode
) {
}
