package in.craves.userchef.onboarding;

import in.craves.userchef.onboarding.ChefOnboardingDtos.DraftApplicant;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Plain-text emails to the support mailbox about one chef sign-up. Everything support needs to call the applicant is in
 * the email itself; DraftApplicant carries no date of birth, street address, FSSAI or ID details, so none can leak here.
 */
final class ChefSignupAlertEmail {
    private ChefSignupAlertEmail() {}

    /** ChefOnboardingPolicy.resume values in onboarding order; the index is the rank. */
    private static final List<String> STEPS =
        List.of("signed-in", "personal", "kitchen", "kitchen-photos", "fssai", "documents", "review", "waiting");
    /** Checklist rows 1..5, matching ranks 1..5 (the step still to do at that rank). */
    private static final List<String> LABELS =
        List.of("Signed in", "Personal details", "Kitchen details", "Kitchen photos", "FSSAI number", "ID proof");
    static final int SUBMITTED = 7;
    private static final String ADMIN_LINE = "Admins: https://admin.craves.in/admin/chef-reviews";
    private static final DateTimeFormatter TIME =
        DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    static int rank(String step) {
        return step == null ? -1 : STEPS.indexOf(step);
    }

    static String phone(String stored) {
        if (stored == null || stored.isBlank()) return "no phone";
        String value = stored.trim();
        return value.matches("\\+91[0-9]{10}")
            ? "+91 " + value.substring(3, 8) + " " + value.substring(8)
            : value;
    }

    static String subject(DraftApplicant a) {
        return "Chef sign-up · " + phone(a.phoneNumber());
    }

    static String stallSubject(DraftApplicant a) {
        return "Stopped 24 h · chef sign-up · " + phone(a.phoneNumber());
    }

    static String stepBody(DraftApplicant a, int rank) {
        String who = who(a);
        String headline = switch (rank) {
            case 0 -> "New chef sign-up: opened the chef application";
            case 1 -> who + " started filling the application";
            case 6 -> who + " finished every step but has not submitted";
            case SUBMITTED -> who + " submitted the application for review";
            default -> who + " finished: " + LABELS.get(rank - 1);
        };
        List<String> top = rank < SUBMITTED ? List.of(headline, "Next step (not done): " + next(rank)) : List.of(headline);
        return body(a, rank, top);
    }

    static String helpBody(DraftApplicant a, int rank, String message) {
        return body(a, rank, List.of(who(a) + " asked for help in the chef application", "", "Message: " + message));
    }

    static String stallBody(DraftApplicant a, int rank, Instant since) {
        return body(a, rank, List.of("Stopped at " + next(rank) + " for 24 hours, no progress since " + TIME.format(since)));
    }

    private static String next(int rank) {
        return rank == 0 ? LABELS.get(1) : rank <= 5 ? LABELS.get(rank) : "Submit";
    }

    private static String who(DraftApplicant a) {
        String name = Stream.of(a.firstName(), a.lastName())
            .filter(part -> part != null && !part.isBlank()).map(String::trim).collect(Collectors.joining(" "));
        if (!name.isEmpty()) return name;
        return a.phoneNumber() == null || a.phoneNumber().isBlank() ? "A chef" : phone(a.phoneNumber());
    }

    /** Sections are separated by one blank line; a section with nothing to show is left out. */
    private static String body(DraftApplicant a, int rank, List<String> top) {
        List<List<String>> sections = new ArrayList<>();
        sections.add(top);
        sections.add(details(a));
        sections.add(progress(rank));
        sections.add(List.of(ADMIN_LINE));
        return sections.stream().filter(section -> !section.isEmpty())
            .map(section -> String.join("\n", section)).collect(Collectors.joining("\n\n"));
    }

    private static List<String> details(DraftApplicant a) {
        List<String> lines = new ArrayList<>();
        if (present(a.phoneNumber())) lines.add("Phone:   " + phone(a.phoneNumber()));
        if (present(a.email())) lines.add("Email:   " + a.email().trim());
        String area = Stream.of(a.city(), a.postalCode()).filter(ChefSignupAlertEmail::present).map(String::trim)
            .collect(Collectors.joining(" "));
        String kitchen = Stream.of(a.kitchenName(), area).filter(ChefSignupAlertEmail::present).map(String::trim)
            .collect(Collectors.joining(", "));
        if (!kitchen.isEmpty()) lines.add("Kitchen: " + kitchen);
        if (a.startedAt() != null && a.lastActivityAt() != null)
            lines.add("Started: " + TIME.format(a.startedAt()) + " · Last active: " + TIME.format(a.lastActivityAt()));
        return lines;
    }

    private static List<String> progress(int rank) {
        List<String> lines = new ArrayList<>();
        lines.add("Progress");
        lines.add(" ✓ " + LABELS.get(0));
        for (int i = 1; i <= 5; i++) lines.add((rank > i ? " ✓ " : " ✗ ") + LABELS.get(i));
        lines.add((rank == SUBMITTED ? " ✓ " : " ✗ ") + "Submitted");
        return lines;
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }
}
