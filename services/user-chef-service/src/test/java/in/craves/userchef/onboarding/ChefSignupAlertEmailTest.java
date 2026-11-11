package in.craves.userchef.onboarding;

import in.craves.userchef.onboarding.ChefOnboardingDtos.DraftApplicant;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static in.craves.userchef.onboarding.ChefSignupAlertEmail.*;
import static org.junit.jupiter.api.Assertions.*;

class ChefSignupAlertEmailTest {
    private static final Instant STARTED = Instant.parse("2026-11-10T03:42:00Z");
    private static final Instant ACTIVE = Instant.parse("2026-11-10T04:01:00Z");

    static DraftApplicant applicant(String first, String last, String email, String phone, String kitchen, String city, String pin) {
        return new DraftApplicant(UUID.randomUUID(), first, last, email, false, phone, "kitchen-photos", "DRAFT", null,
            STARTED, ACTIVE, kitchen, city, pin);
    }
    static DraftApplicant ravi() {
        return applicant("Ravi", "Kumar", "ravi.k@gmail.com", "+919848012345", "Ravi's Tiffins", "Hyderabad", "500072");
    }
    static DraftApplicant phoneOnly() {
        return applicant(null, null, null, "+919848012345", null, null, null);
    }
    static DraftApplicant nobody() {
        return applicant(null, null, null, null, null, null, null);
    }

    @Test
    void ranksEveryResumeStep() {
        assertEquals(0, rank("signed-in"));
        assertEquals(1, rank("personal"));
        assertEquals(2, rank("kitchen"));
        assertEquals(3, rank("kitchen-photos"));
        assertEquals(4, rank("fssai"));
        assertEquals(5, rank("documents"));
        assertEquals(6, rank("review"));
        assertEquals(7, rank("waiting"));
        assertEquals(-1, rank("legacy"));
        assertEquals(-1, rank(null));
    }

    @Test
    void formatsIndianPhones() {
        assertEquals("+91 98480 12345", phone("+919848012345"));
        assertEquals("9848012345", phone("9848012345"));
        assertEquals("+14155550100", phone("+14155550100"));
        assertEquals("no phone", phone(null));
        assertEquals("no phone", phone(" "));
    }

    @Test
    void subjectsKeyOnPhone() {
        assertEquals("Chef sign-up · +91 98480 12345", subject(ravi()));
        assertEquals("Stopped 24 h · chef sign-up · +91 98480 12345", stallSubject(ravi()));
    }

    @Test
    void newSignUpWithOnlyAPhone() {
        String body = stepBody(phoneOnly(), 0);
        assertTrue(body.startsWith("New chef sign-up: opened the chef application\nNext step (not done): Personal details\n\nPhone:   +91 98480 12345\n"), body);
        assertFalse(body.contains("Email:"), body);
        assertFalse(body.contains("Kitchen:"), body);
        assertTrue(body.contains("Progress\n ✓ Signed in\n ✗ Personal details\n"), body);
    }

    @Test
    void kitchenDoneShowsNextStepAndTicks() {
        String body = stepBody(ravi(), 3);
        assertTrue(body.startsWith("Ravi Kumar finished: Kitchen details\nNext step (not done): Kitchen photos\n"), body);
        assertTrue(body.contains("Email:   ravi.k@gmail.com\n"), body);
        assertTrue(body.contains("Kitchen: Ravi's Tiffins, Hyderabad 500072\n"), body);
        assertTrue(body.contains(" ✓ Personal details\n ✓ Kitchen details\n ✗ Kitchen photos\n ✗ FSSAI number\n ✗ ID proof\n ✗ Submitted\n"), body);
        assertTrue(body.endsWith("\n\nAdmins: https://admin.craves.in/admin/chef-reviews"), body);
    }

    @Test
    void everyRankHasItsHeadline() {
        assertTrue(stepBody(ravi(), 1).startsWith("Ravi Kumar started filling the application\nNext step (not done): Personal details\n"));
        assertTrue(stepBody(ravi(), 2).startsWith("Ravi Kumar finished: Personal details\nNext step (not done): Kitchen details\n"));
        assertTrue(stepBody(ravi(), 4).startsWith("Ravi Kumar finished: Kitchen photos\nNext step (not done): FSSAI number\n"));
        assertTrue(stepBody(ravi(), 5).startsWith("Ravi Kumar finished: FSSAI number\nNext step (not done): ID proof\n"));
        assertTrue(stepBody(ravi(), 6).startsWith("Ravi Kumar finished every step but has not submitted\nNext step (not done): Submit\n"));
        assertTrue(stepBody(ravi(), 7).startsWith("Ravi Kumar submitted the application for review\n\n"));
    }

    @Test
    void submittedHasNoNextLineAndTicksAll() {
        String body = stepBody(ravi(), 7);
        assertFalse(body.contains("Next step"), body);
        assertFalse(body.contains("✗"), body);
        assertTrue(body.contains(" ✓ Submitted\n"), body);
    }

    @Test
    void showsTimesInIst() {
        assertTrue(stepBody(ravi(), 2).contains("Started: 10 Nov 09:12 · Last active: 10 Nov 09:31\n"));
    }

    @Test
    void noNameNoPhoneStillReads() {
        DraftApplicant x = nobody();
        assertEquals("Chef sign-up · no phone", subject(x));
        String body = stepBody(x, 2);
        assertTrue(body.startsWith("A chef finished: Personal details"), body);
        assertFalse(body.contains("Phone:"), body);
    }

    @Test
    void phoneStandsInForAMissingName() {
        assertTrue(stepBody(phoneOnly(), 2).startsWith("+91 98480 12345 finished: Personal details"));
    }

    @Test
    void helpCarriesTheMessage() {
        String body = helpBody(ravi(), 3, "Photo upload fails");
        assertTrue(body.startsWith("Ravi Kumar asked for help in the chef application\n\nMessage: Photo upload fails\n\nPhone:   +91 98480 12345\n"), body);
        assertTrue(body.contains(" ✗ Kitchen photos\n"), body);
    }

    @Test
    void stallNamesTheStepAndTime() {
        String body = stallBody(ravi(), 3, ACTIVE);
        assertTrue(body.startsWith("Stopped at Kitchen photos for 24 hours, no progress since 10 Nov 09:31\n\n"), body);
        assertTrue(stallBody(ravi(), 6, ACTIVE).startsWith("Stopped at Submit for 24 hours"));
        assertTrue(stallBody(phoneOnly(), 0, ACTIVE).startsWith("Stopped at Personal details for 24 hours"));
    }

    @Test
    void applicantRowCannotCarrySensitiveFields() {
        List<String> names = Arrays.stream(DraftApplicant.class.getRecordComponents()).map(RecordComponent::getName).toList();
        for (String banned : List.of("dateOfBirth", "addressLine1", "addressLine2", "landmark", "fssaiNumber", "proofKind", "otherGovernmentId")) {
            assertFalse(names.contains(banned), banned);
        }
    }
}
