package in.craves.referral;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(ReferralSettings.class)
public class ReferralApplication {
    public static void main(String[] args) { SpringApplication.run(ReferralApplication.class, args); }
    @Bean Clock referralClock() { return Clock.systemUTC(); }
}
