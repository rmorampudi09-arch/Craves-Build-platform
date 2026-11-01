package in.craves.advanced.promotions;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.promotions.PromotionsDtos.DiscountKind;
import in.craves.advanced.promotions.PromotionsDtos.FundedBy;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.promotions.PromotionsDtos.PromotionStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PromotionRulesTest {
    static final Instant START = Instant.parse("2026-11-01T00:00:00Z");
    static final Instant END = Instant.parse("2026-11-08T00:00:00Z");
    static final Instant DURING = Instant.parse("2026-11-03T12:00:00Z");

    static NewPromotion percent(int off, Long cap, long minOrder) {
        return new NewPromotion("Diwali", "Diwali offer", null, "diwali", DiscountKind.PERCENT, off, null, cap, minOrder, List.of(),
                FundedBy.CRAVES, 1, 1_000_000L, null, START, END, true);
    }

    static NewPromotion flat(long paise, long minOrder) {
        return new NewPromotion("Flat", "Flat off", null, null, DiscountKind.FLAT, null, paise, null, minOrder, List.of(),
                FundedBy.CRAVES, 2, 500_000L, 3, START, END, true);
    }

    @Test
    void discountsRoundDownRespectTheCapAndNeverExceedTheCart() {
        assertThat(PromotionRules.discount(percent(10, null, 0), 33_333)).isEqualTo(3_333);
        assertThat(PromotionRules.discount(percent(50, 10_000L, 0), 40_000)).isEqualTo(10_000);
        assertThat(PromotionRules.discount(percent(100, null, 0), 25_000)).isEqualTo(25_000);
        assertThat(PromotionRules.discount(flat(15_000, 0), 9_000)).isEqualTo(9_000);
        assertThat(PromotionRules.discount(flat(15_000, 20_000), 19_999)).isZero();
        assertThat(PromotionRules.discount(flat(15_000, 20_000), 20_000)).isEqualTo(15_000);
        assertThat(PromotionRules.discount(percent(1, null, 0), 99)).isZero();
        assertThat(PromotionRules.discount(percent(10, null, 0), 0)).isZero();
    }

    @Test
    void refusalsComeInAFixedOrder() {
        NewPromotion terms = flat(10_000, 20_000);
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 0, 0, 0, DURING)).isNull();
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 0, 0, 0, END)).isEqualTo("PROMO_ENDED");
        assertThat(PromotionRules.refusal(PromotionStatus.ENDED, terms, 30_000, 10_000, 0, 0, 0, DURING)).isEqualTo("PROMO_ENDED");
        assertThat(PromotionRules.refusal(PromotionStatus.PAUSED, terms, 30_000, 10_000, 0, 0, 0, DURING)).isEqualTo("PROMO_NOT_ACTIVE");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 0, 0, 0, START.minusSeconds(1))).isEqualTo("PROMO_NOT_ACTIVE");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 0, 0, 0, 0, 0, DURING)).isEqualTo("PROMO_NOT_FOR_THESE_DISHES");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 19_999, 0, 0, 0, 0, DURING)).isEqualTo("PROMO_MIN_ORDER");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 0, 0, 2, DURING)).isEqualTo("PROMO_PERSON_LIMIT");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 3, 30_000, 0, DURING)).isEqualTo("PROMO_EXHAUSTED");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 1, 490_001, 0, DURING)).isEqualTo("PROMO_EXHAUSTED");
        assertThat(PromotionRules.refusal(PromotionStatus.ACTIVE, terms, 30_000, 10_000, 1, 490_000, 0, DURING)).isNull();
    }

    @Test
    void definitionsMustFitTogether() {
        assertThat(PromotionRules.invalid(percent(10, 5_000L, 0))).isEmpty();
        NewPromotion mixed = new NewPromotion("x", "x", null, null, DiscountKind.FLAT, 10, 5_000L, 2_000L, 0L, List.of(), FundedBy.KITCHEN, 1,
                1_000L, null, END, START, false);
        assertThat(PromotionRules.invalid(mixed)).containsExactly("FLAT_NEEDS_FLAT_PAISE_ONLY", "ENDS_BEFORE_START", "KITCHEN_FUNDING_NEEDS_KITCHENS");
        NewPromotion noPercent = new NewPromotion("x", "x", null, null, DiscountKind.PERCENT, null, null, null, 0L, List.of(UUID.randomUUID()),
                FundedBy.KITCHEN, 1, 1_000L, null, START, END, false);
        assertThat(PromotionRules.invalid(noPercent)).containsExactly("PERCENT_NEEDS_PERCENT_OFF_ONLY");
    }

    @Test
    void normalisingCapitalisesTheCodeAndDropsDuplicateKitchens() {
        UUID kitchen = UUID.randomUUID();
        NewPromotion raw = new NewPromotion(" Name ", " Title ", "  ", " diwali50 ", DiscountKind.PERCENT, 50, null, 10_000L, 0L,
                List.of(kitchen, kitchen), FundedBy.KITCHEN, 1, 1_000L, null, START.plusNanos(1_500), END, true);
        NewPromotion stored = PromotionRules.normalise(raw);
        assertThat(stored.code()).isEqualTo("DIWALI50");
        assertThat(stored.description()).isNull();
        assertThat(stored.kitchenIds()).containsExactly(kitchen);
        assertThat(stored.startsAt()).isEqualTo(START.plusNanos(1_000));
        assertThat(PromotionRules.code("  ")).isNull();
    }

    @Test
    void liveTermsAreFrozenButEverythingElseCanChange() {
        NewPromotion before = PromotionRules.normalise(percent(10, 5_000L, 0));
        NewPromotion cosmetic = new NewPromotion("Renamed", "New title", "New text", "DIWALI", DiscountKind.PERCENT, 10, null, 5_000L, 0L, List.of(),
                FundedBy.CRAVES, 1, 9_000_000L, 40, START, END.plusSeconds(3600), false);
        assertThat(PromotionRules.frozenChanges(before, cosmetic)).isEmpty();
        NewPromotion richer = new NewPromotion("Diwali", "Diwali offer", null, "OTHER", DiscountKind.PERCENT, 20, null, null, 100L,
                List.of(UUID.randomUUID()), FundedBy.CRAVES, 2, 1_000_000L, null, START.plusSeconds(1), END, true);
        assertThat(PromotionRules.frozenChanges(before, richer))
                .containsExactly("code", "percentOff", "maxDiscountPaise", "minOrderPaise", "kitchenIds", "perPersonLimit", "startsAt");
    }

    @Test
    void statusChangesFollowTheLifecycle() {
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.DRAFT, PromotionStatus.ACTIVE)).isTrue();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.DRAFT, PromotionStatus.PAUSED)).isFalse();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.ACTIVE, PromotionStatus.PAUSED)).isTrue();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.PAUSED, PromotionStatus.ACTIVE)).isTrue();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.ACTIVE, PromotionStatus.DRAFT)).isFalse();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.PAUSED, PromotionStatus.ENDED)).isTrue();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.ENDED, PromotionStatus.ENDED)).isFalse();
        assertThat(PromotionRules.statusChangeAllowed(PromotionStatus.ENDED, PromotionStatus.ACTIVE)).isFalse();
    }

    @Test
    void reservationMinutesAreClampedAndAnUnreadableValueMeansTen() {
        assertThat(PromotionRules.reservationMinutes("15")).isEqualTo(15);
        assertThat(PromotionRules.reservationMinutes("0")).isEqualTo(1);
        assertThat(PromotionRules.reservationMinutes("600")).isEqualTo(60);
        assertThat(PromotionRules.reservationMinutes("ten")).isEqualTo(10);
    }
}
