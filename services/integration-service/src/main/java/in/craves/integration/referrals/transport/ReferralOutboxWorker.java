package in.craves.integration.referrals.transport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.scheduling.annotation.Scheduled;

public final class ReferralOutboxWorker {
    private final ReferralOutbox outbox;private final ReferralSourceClient client;private final ObjectMapper json;
    public ReferralOutboxWorker(ReferralOutbox outbox,ReferralSourceClient client,ObjectMapper json){this.outbox=outbox;this.client=client;this.json=json;}
    @Scheduled(fixedDelayString="${CRAVES_REFERRAL_SOURCE_POLL_MS:5000}")
    public void drain(){
        for(int n=0;n<10;n++){
            var work=outbox.claim();if(work==null)return;
            try{
                var reply=client.send(ReferralSourceClient.Endpoint.EVENTS,work.envelope().getBytes(StandardCharsets.UTF_8));
                if(reply.status()==202)outbox.acknowledge(work,json.readTree(reply.body()));
                else outbox.failed(work,reply.status()==409 || reply.status()==422);
            }catch(InterruptedException e){outbox.failed(work,false);Thread.currentThread().interrupt();return;}
            catch(Exception e){outbox.failed(work,false);}
        }
    }
}
