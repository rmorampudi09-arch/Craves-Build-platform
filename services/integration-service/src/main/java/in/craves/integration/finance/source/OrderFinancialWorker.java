package in.craves.integration.finance.source;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="CRAVES_FINANCE_FINALIZATION_ENABLED",havingValue="true")
public class OrderFinancialWorker {
    private static final Logger LOG=LoggerFactory.getLogger(OrderFinancialWorker.class);
    private final OrderFinancialFinalizationService service;
    public OrderFinancialWorker(OrderFinancialFinalizationService service){this.service=service;}
    @Scheduled(fixedDelayString="${CRAVES_FINANCE_FINALIZATION_POLL_MS:5000}")
    public void tick(){for(var id:service.pending()){try{service.finish(id);}catch(RuntimeException failure){LOG.warn("Financial finalization deferred for order {}",id);}}}
}
