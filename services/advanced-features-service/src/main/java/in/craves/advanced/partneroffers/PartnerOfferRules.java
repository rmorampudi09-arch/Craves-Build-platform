package in.craves.advanced.partneroffers;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferDraft;
import in.craves.advanced.platform.web.ApiProblem;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

final class PartnerOfferRules {
    /** Paid and not undone: rejected, cancelled and refunded orders unlock nothing. */
    static final Set<String> UNLOCKING = Set.of("PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP",
            "OUT_FOR_DELIVERY", "DELIVERED");
    /** shortcut: a technical bound against typos, not a product rule; raise it if a partner signs a longer deal. */
    static final Duration LONGEST = Duration.ofDays(366);

    private PartnerOfferRules() { }

    static boolean unlocks(String orderStatus) {
        return orderStatus != null && UNLOCKING.contains(orderStatus);
    }

    /** Reports every problem at once. */
    static void check(PartnerOfferDraft draft, Instant now) {
        List<String> problems = new ArrayList<>();
        if (!safeLink(draft.linkUrl())) problems.add("linkUrl must be a plain https link with a host");
        if (java.util.stream.Stream.of(draft.partnerName(), draft.title(), draft.description(), draft.terms()).anyMatch(PartnerOfferRules::hasControl)) {
            problems.add("text must not contain control characters");
        }
        if (!draft.endsAt().isAfter(draft.startsAt())) problems.add("endsAt must be after startsAt");
        if (!draft.endsAt().isAfter(now)) problems.add("endsAt must be in the future");
        if (Duration.between(draft.startsAt(), draft.endsAt()).compareTo(LONGEST) > 0) problems.add("an offer runs at most 366 days");
        if (!problems.isEmpty()) throw new ApiProblem(400, "INVALID_OFFER", "The offer cannot be saved", problems);
    }

    /** Printable ASCII only (no spaces, quotes or angle brackets), https, a host and no user-info, so the link cannot pretend to be another site. */
    static boolean safeLink(String link) {
        if (link == null || !link.matches("https://[\\x21-\\x7E&&[^\"'<>\\\\`]]+")) return false;
        try {
            URI uri = new URI(link);
            return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getRawUserInfo() == null;
        } catch (URISyntaxException ex) {
            return false;
        }
    }

    /** Line breaks are allowed in long text; other control characters (NUL breaks PostgreSQL) are not. */
    static boolean hasControl(String text) {
        return text != null && text.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t');
    }
}
