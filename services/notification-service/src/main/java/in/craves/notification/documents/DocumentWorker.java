package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/** Dedicated bounded worker. Does not enable Spring scheduling for unrelated modules. */
@Component
public class DocumentWorker implements SmartLifecycle {
    private final DocumentSettings settings;
    private final DocumentRepository documents;
    private final DocumentJobRepository jobs;
    private final DocumentEmailRepository emails;
    private final DocumentPdfRenderer renderer;
    private final DocumentStorage storage;
    private final DocumentEmailGateway gateway;
    private final ObjectMapper mapper;
    private final MeterRegistry metrics;
    private volatile boolean running;
    private ScheduledExecutorService executor;
    public DocumentWorker(DocumentSettings settings,DocumentRepository documents,DocumentJobRepository jobs,
        DocumentEmailRepository emails,DocumentPdfRenderer renderer,DocumentStorage storage,
        DocumentEmailGateway gateway,ObjectMapper mapper,MeterRegistry metrics) {
        this.settings=settings; this.documents=documents; this.jobs=jobs; this.emails=emails;
        this.renderer=renderer; this.storage=storage; this.gateway=gateway; this.mapper=mapper; this.metrics=metrics;
    }
    @Override public synchronized void start() {
        if(running || !settings.enabled || !settings.workerEnabled) return;
        executor=Executors.newSingleThreadScheduledExecutor(r->{ Thread t=new Thread(r,"craves-pdf-worker"); t.setDaemon(true); return t; });
        running=true;
        executor.scheduleWithFixedDelay(this::safeTick,0,5,TimeUnit.SECONDS);
    }
    private void safeTick() {
        try { tick(); } catch(RuntimeException ex) { metrics.counter("craves.documents.worker.errors").increment(); }
    }
    public void tick() {
        if(!settings.enabled || !settings.workerEnabled) return;
        jobs.claim().ifPresent(this::render);
        if(settings.emailEnabled) emails.claim().ifPresent(this::email);
    }
    void render(RenderClaim claim) {
        long started=System.nanoTime();
        try {
            Stored stored=claim.document();
            if(!TEMPLATE_VERSION.equals(stored.summary().templateVersion()) ||
                !sha256(stored.snapshot().getBytes(StandardCharsets.UTF_8)).equals(stored.snapshotHash()))
                throw new IllegalArgumentException("SNAPSHOT_OR_TEMPLATE_MISMATCH");
            Snapshot snapshot=mapper.readValue(stored.snapshot(),Snapshot.class)
                .validated(stored.owner(),stored.summary().type(),stored.summary().currency());
            byte[] pdf=renderer.render(snapshot,stored.id(),stored.timezone());
            String key=storage.put(stored.owner(),stored.id(),pdf);
            if(jobs.ready(claim,key,sha256(pdf),pdf.length)) metrics.counter("craves.documents.render.ready").increment();
        } catch(IllegalArgumentException ex) {
            jobs.failed(claim,"DOCUMENT_RENDER_INPUT_UNSUPPORTED",true);
            metrics.counter("craves.documents.render.failed").increment();
        } catch(Exception ex) {
            jobs.failed(claim,"DOCUMENT_RENDER_FAILED",false);
            metrics.counter("craves.documents.render.retry").increment();
        } finally { metrics.timer("craves.documents.render.duration").record(System.nanoTime()-started,TimeUnit.NANOSECONDS); }
    }
    void email(EmailClaim claim) {
        DocumentEmailGateway.Prepared prepared;
        try {
            Stored stored=documents.own(claim.owner(),claim.documentId());
            var summary=stored.summary();
            if(!"READY".equals(summary.status()) || summary.bytes()==null) throw new IllegalStateException();
            byte[] pdf=storage.read(documents.blobKey(claim.owner(),claim.documentId()),summary.sha256(),summary.bytes());
            prepared=gateway.prepare(claim.owner(),summary,pdf);
        } catch(Exception ex) {
            emails.finish(claim,"FAILED",null,"EMAIL_PREFLIGHT_FAILED_OR_UNVERIFIED");
            metrics.counter("craves.documents.email.preflight_failed").increment(); return;
        }
        try {
            var outcome=gateway.send(prepared);
            emails.finish(claim,outcome.status(),outcome.operationId(),outcome.errorCode());
            metrics.counter("craves.documents.email.outcome","status",outcome.status()).increment();
        } catch(Exception ex) {
            // Once submission might have reached ACS, never enqueue an automatic resend.
            emails.finish(claim,"UNKNOWN",null,"EMAIL_OUTCOME_UNKNOWN");
            metrics.counter("craves.documents.email.outcome","status","UNKNOWN").increment();
        }
    }
    @Override public synchronized void stop() {
        running=false;
        if(executor!=null) {
            executor.shutdown();
            try { if(!executor.awaitTermination(90,TimeUnit.SECONDS)) executor.shutdownNow(); }
            catch(InterruptedException ex) { executor.shutdownNow(); Thread.currentThread().interrupt(); }
        }
    }
    @Override public boolean isRunning() { return running; }
    @Override public int getPhase() { return Integer.MAX_VALUE-100; }
}
