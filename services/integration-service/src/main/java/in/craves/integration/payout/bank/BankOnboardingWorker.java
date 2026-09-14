package in.craves.integration.payout.bank;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="CRAVES_BANK_WORKER_ENABLED",havingValue="true")
public class BankOnboardingWorker {
    private static final Logger LOG=LoggerFactory.getLogger(BankOnboardingWorker.class);
    private final BankOnboardingService service;
    public BankOnboardingWorker(BankOnboardingService service) {this.service=service;}
    @Scheduled(fixedDelayString="${CRAVES_BANK_WORKER_DELAY_MS:30000}")
    public void tick() {
        for(int n=0;n<10;n++) {
            try {if(!service.processOne())break;}
            catch(RuntimeException error) {LOG.warn("Bank onboarding pass deferred; inspect masked automation status");break;}
        }
    }
}
