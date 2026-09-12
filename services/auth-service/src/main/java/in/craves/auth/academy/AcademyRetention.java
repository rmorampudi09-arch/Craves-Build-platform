package in.craves.auth.academy;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Own scheduler: does not globally enable other auth-service scheduled workers. */
@Configuration
@ConditionalOnProperty(name="craves.academy.enabled",havingValue="true")
public class AcademyRetention {
    @Bean(destroyMethod="shutdown")
    public ScheduledExecutorService academyRetentionExecutor(AcademyService service) {
        var executor=Executors.newSingleThreadScheduledExecutor(r->{Thread thread=new Thread(r,"academy-retention");thread.setDaemon(true);return thread;});
        executor.scheduleWithFixedDelay(()->{
            try { service.retention(); }
            catch(Exception e) { org.slf4j.LoggerFactory.getLogger(AcademyRetention.class).error("Academy retention failed; retry scheduled",e); }
        },1,24,TimeUnit.HOURS);
        return executor;
    }
}
