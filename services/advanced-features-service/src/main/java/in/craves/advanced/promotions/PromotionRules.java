package in.craves.advanced.promotions;

import in.craves.advanced.promotions.PromotionsDtos.DiscountKind;
import in.craves.advanced.promotions.PromotionsDtos.FundedBy;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.promotions.PromotionsDtos.PromotionStatus;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/** Pure promotion rules, kept apart from the database so they are unit-tested directly. */
final class PromotionRules {
    private PromotionRules() { }

    /** Whole paise, rounded down and never more than the cart, so a promotion never gives more than its terms say. 0: does not qualify. */
    static long discount(NewPromotion terms, long eligibleSubtotal) {
        if (eligibleSubtotal <= 0 || eligibleSubtotal < terms.minOrderPaise()) return 0;
        long off = terms.discountKind() == DiscountKind.PERCENT
                ? Math.multiplyExact(eligibleSubtotal, terms.percentOff().longValue()) / 100 : terms.flatPaise();
        if (terms.maxDiscountPaise() != null) off = Math.min(off, terms.maxDiscountPaise());
        return Math.min(off, eligibleSubtotal);
    }

    /** Why the promotion cannot be used on this cart by this person now (an error code), or null when it can. */
    static String refusal(PromotionStatus status, NewPromotion terms, long eligibleSubtotal, long discount, int committedCount,
                          long committedPaise, int personCount, Instant now) {
        if (status == PromotionStatus.ENDED || !now.isBefore(terms.endsAt())) return "PROMO_ENDED";
        if (status != PromotionStatus.ACTIVE || now.isBefore(terms.startsAt())) return "PROMO_NOT_ACTIVE";
        if (eligibleSubtotal <= 0) return "PROMO_NOT_FOR_THESE_DISHES";
        if (discount <= 0) return "PROMO_MIN_ORDER";
        if (personCount >= terms.perPersonLimit()) return "PROMO_PERSON_LIMIT";
        if (terms.maxRedemptions() != null && committedCount >= terms.maxRedemptions()) return "PROMO_EXHAUSTED";
        if (committedPaise + discount > terms.totalBudgetPaise()) return "PROMO_EXHAUSTED";
        return null;
    }

    /** Terms that do not fit together, as codes (empty when the definition is valid). */
    static List<String> invalid(NewPromotion terms) {
        List<String> problems = new ArrayList<>();
        if (terms.discountKind() == DiscountKind.PERCENT && (terms.percentOff() == null || terms.flatPaise() != null)) {
            problems.add("PERCENT_NEEDS_PERCENT_OFF_ONLY");
        }
        if (terms.discountKind() == DiscountKind.FLAT && (terms.flatPaise() == null || terms.percentOff() != null || terms.maxDiscountPaise() != null)) {
            problems.add("FLAT_NEEDS_FLAT_PAISE_ONLY");
        }
        if (!terms.endsAt().isAfter(terms.startsAt())) problems.add("ENDS_BEFORE_START");
        if (terms.fundedBy() == FundedBy.KITCHEN && terms.kitchenIds().isEmpty()) problems.add("KITCHEN_FUNDING_NEEDS_KITCHENS");
        return problems;
    }

    /** Terms that changed; once a promotion has been active they are frozen, so no customer is promised one thing and given another. */
    static List<String> frozenChanges(NewPromotion before, NewPromotion after) {
        List<String> changed = new ArrayList<>();
        if (!Objects.equals(before.code(), after.code())) changed.add("code");
        if (before.discountKind() != after.discountKind()) changed.add("discountKind");
        if (!Objects.equals(before.percentOff(), after.percentOff())) changed.add("percentOff");
        if (!Objects.equals(before.flatPaise(), after.flatPaise())) changed.add("flatPaise");
        if (!Objects.equals(before.maxDiscountPaise(), after.maxDiscountPaise())) changed.add("maxDiscountPaise");
        if (!Objects.equals(before.minOrderPaise(), after.minOrderPaise())) changed.add("minOrderPaise");
        if (!new HashSet<>(before.kitchenIds()).equals(new HashSet<>(after.kitchenIds()))) changed.add("kitchenIds");
        if (before.fundedBy() != after.fundedBy()) changed.add("fundedBy");
        if (!Objects.equals(before.perPersonLimit(), after.perPersonLimit())) changed.add("perPersonLimit");
        if (!before.startsAt().equals(after.startsAt())) changed.add("startsAt");
        return changed;
    }

    /** DRAFT can go live or be dropped; a live promotion pauses, resumes or ends; ENDED is final. */
    static boolean statusChangeAllowed(PromotionStatus from, PromotionStatus to) {
        if (from == to) return from != PromotionStatus.ENDED;
        return switch (to) {
            case DRAFT -> false;
            case ACTIVE -> from == PromotionStatus.DRAFT || from == PromotionStatus.PAUSED;
            case PAUSED -> from == PromotionStatus.ACTIVE;
            case ENDED -> true;
        };
    }

    /** The stored form: code in capitals or null, kitchens distinct, text trimmed, times at the database's microsecond precision. */
    static NewPromotion normalise(NewPromotion terms) {
        return new NewPromotion(terms.name().strip(), terms.title().strip(), blankToNull(terms.description()), code(terms.code()),
                terms.discountKind(), terms.percentOff(), terms.flatPaise(), terms.maxDiscountPaise(), terms.minOrderPaise(),
                terms.kitchenIds() == null ? List.of() : terms.kitchenIds().stream().distinct().toList(), terms.fundedBy(),
                terms.perPersonLimit(), terms.totalBudgetPaise(), terms.maxRedemptions(), terms.startsAt().truncatedTo(ChronoUnit.MICROS),
                terms.endsAt().truncatedTo(ChronoUnit.MICROS), terms.listed());
    }

    static String code(String code) {
        return code == null || code.isBlank() ? null : code.strip().toUpperCase(Locale.ROOT);
    }

    /** Kept between 1 and 60; anything unreadable means 10, because a bad setting must not stop the other modules from starting. */
    static int reservationMinutes(String setting) {
        try {
            return Math.max(1, Math.min(60, Integer.parseInt(setting.strip())));
        } catch (RuntimeException unreadable) {
            return 10;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
