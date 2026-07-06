package in.craves.userchef;

import in.craves.userchef.config.CravesJwtProperties;
import in.craves.userchef.config.DocumentStoreProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({CravesJwtProperties.class, DocumentStoreProperties.class})
public class UserChefServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserChefServiceApplication.class, args);
    }
}
