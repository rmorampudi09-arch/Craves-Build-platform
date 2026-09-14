package in.craves.integration.payout;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="craves.razorpayx.worker-enabled",havingValue="true")
public class ChefPayoutWorker {
    private static final Logger LOG=LoggerFactory.getLogger(ChefPayoutWorker.class);
    private final ChefPayoutService payouts;private final RazorpayXPayoutClient provider;
    public ChefPayoutWorker(ChefPayoutService payouts,RazorpayXPayoutClient provider) {this.payouts=payouts;this.provider=provider;}
    @Scheduled(fixedDelayString="${craves.razorpayx.poll-interval-ms:30000}")
    public void tick() {
        payouts.recoverStaleSubmissions();
        for(var chef:payouts.dueChefs()) {try{payouts.reserveAutomatic(chef);}catch(RuntimeException e){LOG.warn("Chef payout reservation deferred for {}",chef);}}
        for(int n=0;n<25;n++) {
            var work=payouts.claim();if(work==null)break;
            try {
                var receipt=work.providerId()==null?provider.submit(work.instruction()):provider.fetch(work.instruction());
                payouts.recordOutcome(work,receipt);
            } catch(RuntimeException e) {
                payouts.uncertain(work);LOG.warn("Chef payout outcome retained for reconciliation: {}",work.id());
            }
        }
    }
}
