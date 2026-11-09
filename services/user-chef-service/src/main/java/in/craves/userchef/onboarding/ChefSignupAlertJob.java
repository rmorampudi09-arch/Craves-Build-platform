package in.craves.userchef.onboarding;

import in.craves.userchef.onboarding.ChefOnboardingDtos.DraftApplicant;
import in.craves.userchef.onboarding.ChefSignupAlertStore.AlertRow;
import in.craves.userchef.onboarding.ChefSignupAlertStore.HelpRow;
import in.craves.userchef.service.NotificationInternalClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import static in.craves.userchef.onboarding.ChefSignupAlertEmail.*;

/**
 * Emails the support mailbox when a chef opens the application, moves forward a step, submits, asks for help, or makes no
 * progress for 24 hours, so support can call people who stop halfway. Runs outside chef requests, so it can never slow or
 * fail a sign-up. Safe on several replicas: each email has a fixed requestKey that notification-service keeps once, and a
 * row is written only after the email was accepted, so a failure is simply tried again next run.
 */
@Component
public class ChefSignupAlertJob {
    private static final Logger log = LoggerFactory.getLogger(ChefSignupAlertJob.class);
    private static final Duration STALL = Duration.ofHours(24);

    private final ChefOnboardingService onboarding;
    private final ChefSignupAlertStore store;
    private final NotificationInternalClient notifications;
    private final String email;

    public ChefSignupAlertJob(ChefOnboardingService onboarding, ChefSignupAlertStore store,
                              NotificationInternalClient notifications,
                              @Value("${craves.chef-signup-alerts.email:}") String email) {
        this.onboarding = onboarding;
        this.store = store;
        this.notifications = notifications;
        this.email = email == null ? "" : email.trim();
    }

    @Scheduled(
        initialDelayString = "${craves.chef-signup-alerts.initial-delay-ms:120000}",
        fixedDelayString = "${craves.chef-signup-alerts.fixed-delay-ms:300000}"
    )
    public void run() {
        run(Instant.now());
    }

    void run(Instant now) {
        if (email.isEmpty()) return;
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            log.warn("Chef sign-up alerts are off: CRAVES_CHEF_SIGNUP_ALERT_EMAIL is not an email address");
            return;
        }
        // shortcut: reloads every unapproved applicant (newest 1000) each run; filter in SQL once that list grows large.
        for (DraftApplicant a : onboarding.applicants(true)) {
            if (!tell(a, now)) {
                log.warn("Chef sign-up alerts paused this run; notification-service did not accept an email");
                return;
            }
        }
    }

    /** False when an email was not accepted: the run stops and everything is tried again next time. */
    private boolean tell(DraftApplicant a, Instant now) {
        int rank = rank(a.step());
        if (rank < 0) return true;
        UUID id = a.identityId();
        Optional<AlertRow> found = store.find(id);
        if (found.isEmpty()) {
            if (!send(a, "rank-" + rank, subject(a), stepBody(a, rank))) return false;
            store.insert(id, rank);
            return true;
        }
        AlertRow row = found.get();
        if (row.muted()) return true;
        boolean advanced = rank > row.lastRank();
        if (advanced) {
            if (!send(a, "rank-" + rank, subject(a), stepBody(a, rank))) return false;
            store.advance(id, rank);
        }
        Optional<HelpRow> help = store.latestHelp(id);
        if (help.isPresent() && !help.get().id().equals(row.helpAlertedId())) {
            if (!send(a, "help-" + help.get().id(), subject(a), helpBody(a, rank, help.get().message()))) return false;
            store.helpAlerted(id, help.get().id());
        }
        // row.lastRank() < SUBMITTED: no "stopped" email for someone sent back for changes after submitting.
        if (!advanced && row.lastRank() < SUBMITTED && !row.stallAlerted() && row.lastRankAt().isBefore(now.minus(STALL))) {
            if (!send(a, "stall", stallSubject(a), stallBody(a, rank, row.lastRankAt()))) return false;
            store.stallAlerted(id);
        }
        return true;
    }

    private boolean send(DraftApplicant a, String event, String subject, String body) {
        return notifications.teamEmail(a.identityId(), "chef-signup-" + a.identityId() + "-" + event, email, subject, body);
    }
}
