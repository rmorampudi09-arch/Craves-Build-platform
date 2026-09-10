package in.craves.order.schedule;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ScheduledOrderConfiguration {
    @Bean
    @ConditionalOnMissingBean(Clock.class)
    Clock scheduledOrderClock() {
        return Clock.systemUTC();
    }
}
