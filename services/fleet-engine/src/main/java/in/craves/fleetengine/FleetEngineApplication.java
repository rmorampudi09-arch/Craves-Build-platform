package in.craves.fleetengine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Craves's rider dispatch engine (docs/riders/SCALE.md). It reads rider events and dispatch requests that
 * integration-service writes to Redis Streams, keeps each online rider's live state in Redis, and ranks riders for the
 * orders waiting in each map block: in shadow, to compare with the Java dispatcher; live, to answer it. Postgres and
 * integration-service stay the record: every offer is still made there. It serves only health probes over HTTP.
 */
@SpringBootApplication
public class FleetEngineApplication {
    public static void main(String[] args) {
        LiveRuntimeLock.verify();
        SpringApplication.run(FleetEngineApplication.class, args);
    }
}
