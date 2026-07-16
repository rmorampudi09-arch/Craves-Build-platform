package in.craves.order;

import in.craves.order.config.CatalogClientProperties;
import in.craves.order.config.CravesJwtProperties;
import in.craves.order.config.NotificationClientProperties;
import in.craves.order.config.NotificationOutboxDispatcherProperties;
import in.craves.order.config.UserChefInternalClientProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({
    CravesJwtProperties.class,
    CatalogClientProperties.class,
    UserChefInternalClientProperties.class,
    NotificationClientProperties.class,
    NotificationOutboxDispatcherProperties.class
})
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
