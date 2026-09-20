package in.craves.integration.referrals.transport;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Clock;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralTransportConfiguration {
    @Bean ReferralOutbox referralOutbox(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){return new ReferralOutbox(db,json,new TransactionTemplate(manager));}
    @Bean(destroyMethod="close") ReferralSourceClient referralSourceClient(@Value("${CRAVES_REFERRAL_SERVICE_ORIGIN:}") String origin,@Value("${CRAVES_REFERRAL_SOURCE_HMAC_BASE64:}") String key){
        return new ReferralSourceClient(URI.create(origin),"finance","current",Base64.getDecoder().decode(key),Clock.systemUTC());
    }
    @Bean ReferralOutboxWorker referralOutboxWorker(ReferralOutbox outbox,ReferralSourceClient client,ObjectMapper json){return new ReferralOutboxWorker(outbox,client,json);}
    @Bean(name="referralTaskScheduler")
    org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler referralTaskScheduler(){
        var scheduler=new org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);scheduler.setThreadNamePrefix("referral-worker-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);scheduler.setAwaitTerminationSeconds(20);
        scheduler.setRemoveOnCancelPolicy(true);return scheduler;
    }

}
