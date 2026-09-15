package in.craves.order.finance;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="CRAVES_FINANCE_SOURCE_DISPATCH_ENABLED",havingValue="true")
public class FinanceSourceOutboxWorker {
    private final FinanceSourceOutboxService outbox;private final FinanceSourceClient client;
    public FinanceSourceOutboxWorker(FinanceSourceOutboxService outbox,FinanceSourceClient client){this.outbox=outbox;this.client=client;}
    @Scheduled(fixedDelayString="${CRAVES_FINANCE_SOURCE_POLL_MS:5000}")
    public void tick(){for(int n=0;n<25;n++){var work=outbox.claim();if(work==null)return;try{outbox.complete(work,client.event(work.payload()));}catch(RuntimeException e){outbox.retry(work);}}}
}
