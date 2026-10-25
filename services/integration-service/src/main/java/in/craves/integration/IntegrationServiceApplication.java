package in.craves.integration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class IntegrationServiceApplication {
    public static void main(String[] args) {
        LiveRuntimeLock.verify();
        SpringApplication.run(IntegrationServiceApplication.class, args);
    }
}
