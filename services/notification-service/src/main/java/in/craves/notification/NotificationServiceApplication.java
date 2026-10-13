package in.craves.notification;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class NotificationServiceApplication {
    public static void main(String[] args) {
        LiveRuntimeLock.verify();
        SpringApplication.run(NotificationServiceApplication.class, args);
    }
}
