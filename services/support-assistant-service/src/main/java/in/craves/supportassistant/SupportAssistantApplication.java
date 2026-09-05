package in.craves.supportassistant;

import in.craves.supportassistant.config.CravesJwtProperties;
import in.craves.supportassistant.config.SupportAssistantProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({CravesJwtProperties.class, SupportAssistantProperties.class})
public class SupportAssistantApplication {
    public static void main(String[] args) {
        SpringApplication.run(SupportAssistantApplication.class, args);
    }
}
