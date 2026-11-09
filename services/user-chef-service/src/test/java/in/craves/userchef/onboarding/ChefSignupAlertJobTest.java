package in.craves.userchef.onboarding;

import in.craves.userchef.onboarding.ChefOnboardingDtos.DraftApplicant;
import in.craves.userchef.onboarding.ChefSignupAlertStore.AlertRow;
import in.craves.userchef.onboarding.ChefSignupAlertStore.HelpRow;
import in.craves.userchef.service.NotificationInternalClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChefSignupAlertJobTest {
    private static final Instant NOW = Instant.parse("2026-11-11T04:00:00Z");
    private static final String TO = "Waitlist@craves.in";
    private static final String SUBJECT = "Chef sign-up · +91 98480 12345";

    private ChefOnboardingService onboarding;
    private ChefSignupAlertStore store;
    private NotificationInternalClient notifications;
    private UUID id;

    @BeforeEach
    void setUp() {
        onboarding = mock(ChefOnboardingService.class);
        store = mock(ChefSignupAlertStore.class);
        notifications = mock(NotificationInternalClient.class);
        id = UUID.randomUUID();
        when(notifications.teamEmail(any(), anyString(), anyString(), anyString(), anyString())).thenReturn(true);
        when(store.latestHelp(any())).thenReturn(Optional.empty());
    }

    private ChefSignupAlertJob job(String email) {
        return new ChefSignupAlertJob(onboarding, store, notifications, email);
    }

    private DraftApplicant applicant(UUID identityId, String step) {
        return new DraftApplicant(identityId, "Ravi", "Kumar", "ravi.k@gmail.com", true, "+919848012345", step, "DRAFT", null,
            NOW.minus(Duration.ofDays(2)), NOW.minus(Duration.ofHours(1)), "Ravi's Tiffins", "Hyderabad", "500072");
    }

    private void given(String step) {
        when(onboarding.applicants(true)).thenReturn(List.of(applicant(id, step)));
    }

    private void row(int rank, Duration ago, UUID helpAlerted, boolean stallAlerted, boolean muted) {
        when(store.find(id)).thenReturn(Optional.of(new AlertRow(rank, NOW.minus(ago), helpAlerted, stallAlerted, muted)));
    }

    private void neverSends() {
        verify(notifications, never()).teamEmail(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void offWhenAddressEmpty() {
        job("").run(NOW);
        job(null).run(NOW);
        verifyNoInteractions(onboarding, store, notifications);
    }

    @Test
    void offWhenAddressInvalid() {
        job("waitlist").run(NOW);
        verifyNoInteractions(onboarding, store, notifications);
    }

    @Test
    void trimsTheAddress() {
        given("signed-in");
        when(store.find(id)).thenReturn(Optional.empty());
        job(" Waitlist@craves.in ").run(NOW);
        verify(notifications).teamEmail(eq(id), anyString(), eq(TO), anyString(), anyString());
    }

    @Test
    void newApplicantGetsSignUpEmailThenRow() {
        given("signed-in");
        when(store.find(id)).thenReturn(Optional.empty());
        job(TO).run(NOW);
        var order = inOrder(notifications, store);
        order.verify(notifications).teamEmail(eq(id), eq("chef-signup-" + id + "-rank-0"), eq(TO), eq(SUBJECT),
            startsWith("New chef sign-up: opened the chef application"));
        order.verify(store).insert(id, 0);
    }

    @Test
    void sameRankSendsNothing() {
        given("kitchen-photos");
        row(3, Duration.ofHours(1), null, false, false);
        job(TO).run(NOW);
        neverSends();
        verify(store, never()).advance(any(), anyInt());
    }

    @Test
    void rankUpSendsOneEmail() {
        given("kitchen-photos");
        row(1, Duration.ofHours(30), null, false, false);
        job(TO).run(NOW);
        verify(notifications, times(1)).teamEmail(eq(id), eq("chef-signup-" + id + "-rank-3"), eq(TO), eq(SUBJECT),
            startsWith("Ravi Kumar finished: Kitchen details"));
        verify(store).advance(id, 3);
        verify(store, never()).stallAlerted(any());
    }

    @Test
    void rankDownSendsNothing() {
        given("kitchen");
        row(5, Duration.ofHours(1), null, false, false);
        job(TO).run(NOW);
        neverSends();
        verify(store, never()).advance(any(), anyInt());
    }

    @Test
    void failedSendLeavesRowAndStopsRun() {
        UUID other = UUID.randomUUID();
        when(onboarding.applicants(true)).thenReturn(List.of(applicant(id, "signed-in"), applicant(other, "signed-in")));
        when(store.find(any())).thenReturn(Optional.empty());
        when(notifications.teamEmail(any(), anyString(), anyString(), anyString(), anyString())).thenReturn(false);
        job(TO).run(NOW);
        verify(store, never()).insert(any(), anyInt());
        verify(store, never()).find(other);
    }

    @Test
    void mutedApplicantSkipped() {
        given("documents");
        row(0, Duration.ofDays(3), null, false, true);
        job(TO).run(NOW);
        neverSends();
    }

    @Test
    void unknownStepSkippedOthersContinue() {
        UUID other = UUID.randomUUID();
        when(onboarding.applicants(true)).thenReturn(List.of(applicant(id, "legacy"), applicant(other, "signed-in")));
        when(store.find(other)).thenReturn(Optional.empty());
        job(TO).run(NOW);
        verify(store, never()).find(id);
        verify(notifications).teamEmail(eq(other), eq("chef-signup-" + other + "-rank-0"), eq(TO), anyString(), anyString());
    }

    @Test
    void stallOnceAfter24Hours() {
        given("kitchen-photos");
        row(3, Duration.ofHours(25), null, false, false);
        job(TO).run(NOW);
        verify(notifications).teamEmail(eq(id), eq("chef-signup-" + id + "-stall"), eq(TO),
            eq("Stopped 24 h · chef sign-up · +91 98480 12345"), startsWith("Stopped at Kitchen photos for 24 hours"));
        verify(store).stallAlerted(id);
    }

    @Test
    void noStallBefore24HoursOrWhenAlerted() {
        given("kitchen-photos");
        row(3, Duration.ofHours(23), null, false, false);
        job(TO).run(NOW);
        row(3, Duration.ofHours(25), null, true, false);
        job(TO).run(NOW);
        neverSends();
    }

    @Test
    void noStallAfterSubmit() {
        given("waiting");
        row(7, Duration.ofHours(48), null, false, false);
        job(TO).run(NOW);
        neverSends();
    }

    @Test
    void noStallAfterSentBackForChanges() {
        // Sent back for changes: submitted turns false, so the rank drops below 7 while the row still says 7.
        given("documents");
        row(7, Duration.ofHours(48), null, false, false);
        job(TO).run(NOW);
        neverSends();
    }

    @Test
    void newHelpRequestSendsHelpEmail() {
        UUID helpId = UUID.randomUUID();
        given("kitchen-photos");
        row(3, Duration.ofHours(1), null, false, false);
        when(store.latestHelp(id)).thenReturn(Optional.of(new HelpRow(helpId, "Photo upload fails")));
        job(TO).run(NOW);
        verify(notifications).teamEmail(eq(id), eq("chef-signup-" + id + "-help-" + helpId), eq(TO), eq(SUBJECT),
            contains("Message: Photo upload fails"));
        verify(store).helpAlerted(id, helpId);
    }

    @Test
    void alreadyAlertedHelpSendsNothing() {
        UUID helpId = UUID.randomUUID();
        given("kitchen-photos");
        row(3, Duration.ofHours(1), helpId, false, false);
        when(store.latestHelp(id)).thenReturn(Optional.of(new HelpRow(helpId, "Photo upload fails")));
        job(TO).run(NOW);
        neverSends();
    }
}
