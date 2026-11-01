package in.craves.advanced.partneroffers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferDraft;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PartnerOfferRulesTest {
    static final Instant NOW = Instant.parse("2026-11-01T06:00:00Z");

    static PartnerOfferDraft draft(Instant starts, Instant ends) {
        return new PartnerOfferDraft("Brew Co", "20% off coffee", "Any coffee", "One per person", "https://brew.example/craves", "CRAVES20",
                starts, ends, null, null);
    }

    @Test
    void onlyPaidOrdersThatWereNotUndoneUnlockOffers() {
        assertThat(PartnerOfferRules.unlocks("PAID")).isTrue();
        assertThat(PartnerOfferRules.unlocks("DELIVERED")).isTrue();
        assertThat(PartnerOfferRules.unlocks("PAYMENT_PENDING")).isFalse();
        assertThat(PartnerOfferRules.unlocks("CHEF_REJECTED")).isFalse();
        assertThat(PartnerOfferRules.unlocks("REFUNDED")).isFalse();
        assertThat(PartnerOfferRules.unlocks("SOMETHING_NEW")).isFalse();
        assertThat(PartnerOfferRules.unlocks(null)).isFalse();
    }

    @Test
    void windowsMustBeFutureOrderedAndBounded() {
        PartnerOfferRules.check(draft(NOW.minus(Duration.ofDays(1)), NOW.plus(Duration.ofDays(30))), NOW);
        assertThatThrownBy(() -> PartnerOfferRules.check(draft(NOW.minus(Duration.ofDays(3)), NOW.minus(Duration.ofDays(1))), NOW))
                .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.details()).containsExactly("endsAt must be in the future"));
        assertThatThrownBy(() -> PartnerOfferRules.check(draft(NOW.plus(Duration.ofDays(2)), NOW.plus(Duration.ofDays(1))), NOW))
                .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.details()).containsExactly("endsAt must be after startsAt"));
        assertThatThrownBy(() -> PartnerOfferRules.check(draft(NOW, NOW.plus(Duration.ofDays(400))), NOW))
                .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.code()).isEqualTo("INVALID_OFFER"));
    }

    @Test
    void linksMustBePlainHttpsWithAHostAndTextHasNoControlCharacters() {
        assertThat(PartnerOfferRules.safeLink("https://brew.example/craves?src=app&x=1")).isTrue();
        assertThat(PartnerOfferRules.safeLink("http://brew.example")).isFalse();
        assertThat(PartnerOfferRules.safeLink("https://@evil.example")).isFalse();
        assertThat(PartnerOfferRules.safeLink("https://user@evil.example/")).isFalse();
        assertThat(PartnerOfferRules.safeLink("https://brew.example/\"onclick")).isFalse();
        assertThat(PartnerOfferRules.safeLink("https://brew.example/\u2028x")).isFalse();
        assertThat(PartnerOfferRules.safeLink("javascript:alert(1)")).isFalse();
        assertThat(PartnerOfferRules.hasControl("Line one\nline two")).isFalse();
        assertThat(PartnerOfferRules.hasControl("bad\u0000")).isTrue();
        assertThatThrownBy(() -> PartnerOfferRules.check(new PartnerOfferDraft("Brew\u0000", "t", "d", "x", "https://brew.example", null,
                NOW, NOW.plus(Duration.ofDays(1)), null, null), NOW))
                .isInstanceOfSatisfying(ApiProblem.class, p -> assertThat(p.details()).containsExactly("text must not contain control characters"));
    }
}
