package in.craves.auth.email;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.context.SmartLifecycle;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Dedicated executor: starting email projection does not enable unrelated schedulers. */
@Component
public class EmailProjectionWorker implements SmartLifecycle {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final EmailVerificationSettings settings;
    private final EmailVerificationTransport transport;
    private final Clock clock;
    private volatile ScheduledExecutorService executor;
    public EmailProjectionWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,EmailVerificationSettings settings,
        EmailVerificationTransport transport,Clock clock) {
        this.jdbc=jdbc; tx=new TransactionTemplate(manager); this.settings=settings; this.transport=transport; this.clock=clock;
    }
    public synchronized void start() {
        if (!settings.projectionEnabled() || executor!=null) return;
        executor=Executors.newSingleThreadScheduledExecutor(r->{Thread thread=new Thread(r,"auth-email-projection");thread.setDaemon(true);return thread;});
        executor.scheduleWithFixedDelay(()->{try {runOnce();} catch(Exception ignored) { /* Durable rows retain retry evidence. */ }},1,5,TimeUnit.SECONDS);
    }
    public synchronized void stop() { if(executor!=null) {executor.shutdownNow();executor=null;} }
    public boolean isRunning() { return executor!=null && !executor.isShutdown(); }
    public boolean isAutoStartup() { return settings.projectionEnabled(); }
    public int getPhase() { return Integer.MAX_VALUE-100; }
    public int runOnce() {
        if (!settings.projectionEnabled()) return 0;
        Instant now=clock.instant(); UUID lease=UUID.randomUUID();
        List<Event> events=tx.execute(ignored->jdbc.query(
            "UPDATE auth_email_projection_outbox SET lease_id=?,lease_expires_at=?,attempts=attempts+1 WHERE event_id IN ("+
            "SELECT event_id FROM auth_email_projection_outbox WHERE delivered_at IS NULL AND next_attempt_at<=? "+
            "AND (lease_expires_at IS NULL OR lease_expires_at<?) ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *",
            (rs,row)->new Event(rs.getObject("event_id",UUID.class),rs.getObject("identity_id",UUID.class),rs.getString("email"),
                rs.getLong("email_revision"),rs.getTimestamp("verified_at").toInstant(),rs.getInt("attempts")),
            lease,Timestamp.from(now.plusSeconds(120)),Timestamp.from(now),Timestamp.from(now)));
        if (events==null) return 0;
        for (Event event:events) {
            boolean sent;
            try { sent=transport.project(event.eventId,event.owner,event.email,event.revision,event.verifiedAt); }
            catch (Exception ignored) { sent=false; }
            if (sent) jdbc.update("UPDATE auth_email_projection_outbox SET delivered_at=?,lease_id=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE event_id=? AND lease_id=?",
                Timestamp.from(clock.instant()),event.eventId,lease);
            else jdbc.update("UPDATE auth_email_projection_outbox SET next_attempt_at=?,lease_id=NULL,lease_expires_at=NULL,last_error_code='PROJECTION_UNAVAILABLE' WHERE event_id=? AND lease_id=?",
                Timestamp.from(clock.instant().plusSeconds(Math.min(3600L,5L<<Math.min(event.attempts,10)))),event.eventId,lease);
        }
        return events.size();
    }
    private record Event(UUID eventId,UUID owner,String email,long revision,Instant verifiedAt,int attempts) { }
}
