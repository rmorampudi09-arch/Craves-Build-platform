package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.FleetPolicyStore.DispatchRules;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetPolicyStore.TermsChange;
import in.craves.integration.fleet.rider.FleetRiderModels.LabelValue;
import in.craves.integration.fleet.rider.FleetRiderModels.OfferRules;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FleetRiderServiceTest {
    static final RateCard DRAFT = new RateCard("2026-10-v1", true, Instant.parse("2026-11-03T18:30:00Z"), 4000, 2000, 900, 1000, 900,
        8, 150, 8000, Map.of(), Map.of("en", List.of("First version of the Craves rider terms. Draft pricing, not final.")), null);

    @Test
    void theRateCardLinesComeFromTheStoredValuesInTheDesignWording() {
        Terms terms = FleetRiderService.terms(DRAFT, 130, null, "en", "+914012345678");
        assertThat(terms.rateCardLines()).containsExactly(
            new LabelValue("Base pay, first 2 km of the drop", "₹40"),
            new LabelValue("Each drop km after 2 km", "₹9"),
            new LabelValue("Ride to the kitchen, each km after the first 1 km", "₹9"),
            new LabelValue("Pickup distance", "straight line × 1.3"),
            new LabelValue("Waiting at the kitchen, after 8 free minutes", "₹1.50 a minute"),
            new LabelValue("Order cancelled after you reach the kitchen", "₹20 plus the ride to the kitchen"),
            new LabelValue("Order cancelled after pickup: return to the kitchen, each km", "₹9"),
            new LabelValue("Customer not answering: full pay after two calls and a wait of", "10 minutes"),
            new LabelValue("Guaranteed minimum in a booked slot", "₹80 an hour"),
            new LabelValue("Declining or missing an offer", "Free"));
        assertThat(terms.grievanceLines()).extracting(LabelValue::value)
            .containsExactly("+914012345678", "Link added when the state portal opens");
        assertThat(terms.draft()).isTrue();
        assertThat(terms.version()).isEqualTo("2026-10-v1");
    }

    @Test
    void theNextChangeShowsTheLinesRidersWillHaveThenInTheirLanguage() {
        RateCard next = new RateCard("2026-12-v2", false, Instant.parse("2026-12-01T18:30:00Z"), 4500, 2000, 900, 1000, 900, 8, 150, 8000,
            Map.of(), Map.of("en", List.of("Base pay goes up to ₹45."), "te", List.of("బేస్ పే ₹45.")), null);
        Terms terms = FleetRiderService.terms(DRAFT, 130, new TermsChange(next.effectiveFrom(), next, true, 130, 130), "te", "");
        assertThat(terms.version()).isEqualTo("2026-10-v1");
        assertThat(terms.upcoming().version()).isEqualTo("2026-12-v2");
        assertThat(terms.upcoming().effectiveFrom()).isEqualTo(next.effectiveFrom());
        assertThat(terms.upcoming().summaryOfChanges()).containsExactly("బేస్ పే ₹45.");
        assertThat(terms.upcoming().rateCardLines().get(0)).isEqualTo(new LabelValue("Base pay, first 2 km of the drop", "₹45"));
        assertThat(terms.upcoming().rateCardLines()).hasSameSizeAs(terms.rateCardLines());
        assertThat(FleetRiderService.terms(DRAFT, 130, null, "en", "").upcoming()).isNull();
    }

    @Test
    void aDetourChangeIsAnUpcomingChangeWithItsOwnLine() {
        Instant at = Instant.parse("2026-11-20T00:00:00Z");
        Terms detourOnly = FleetRiderService.terms(DRAFT, 130, new TermsChange(at, DRAFT, false, 130, 150), "hi", "");
        assertThat(detourOnly.upcoming().version()).as("the card in force then").isEqualTo("2026-10-v1");
        assertThat(detourOnly.upcoming().effectiveFrom()).isEqualTo(at);
        assertThat(detourOnly.upcoming().summaryOfChanges()).containsExactly("Pickup distance changes from straight line × 1.3 to × 1.5.");
        assertThat(detourOnly.upcoming().rateCardLines()).contains(new LabelValue("Pickup distance", "straight line × 1.5"));
        assertThat(detourOnly.rateCardLines()).contains(new LabelValue("Pickup distance", "straight line × 1.3"));

        Terms both = FleetRiderService.terms(DRAFT, 130, new TermsChange(DRAFT.effectiveFrom(), DRAFT, true, 130, 125), "en", "");
        assertThat(both.upcoming().summaryOfChanges()).containsExactly(
            "First version of the Craves rider terms. Draft pricing, not final.", "Pickup distance changes from straight line × 1.3 to × 1.25.");
        assertThat(FleetRiderService.factor(100)).isEqualTo("1");
    }

    /** Phase 4: how orders are offered is part of the terms, and a change to it is an upcoming change with its own line. */
    @Test
    void howOrdersAreOfferedIsInTheTermsAndAChangeToItHasItsOwnLine() {
        assertThat(FleetRiderService.offerRulesLine(DispatchRules.TODAY))
            .isEqualTo("The 3 nearest free riders hear at once, and the first to accept gets it. Declining is free.");
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 3, 0)))
            .isEqualTo("The nearest free rider hears first, one rider at a time, in up to 3 rounds. Declining is free.");
        String fair = "Among the free riders within 1.5 km of the nearest, the one who has earned the least per online hour today hears "
            + "first, one rider at a time, in up to 3 rounds. Declining is free.";
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 3, 1500))).isEqualTo(fair);
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(2, 1, 1000))).isEqualTo("Among the free riders within 1 km of the "
            + "nearest, the 2 who have earned the least per online hour today hear at once, and the first to accept gets it. Declining is free.");

        // Phase 5: ranked by travel time, "nearest" is the soonest at the kitchen, and the band is counted in minutes.
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 1, 0, true))).isEqualTo("The free rider who can reach the kitchen "
            + "soonest hears first, one rider at a time. Soonest is by Craves's travel-time estimate; without one, the nearest hear first. "
            + "Declining is free.");
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 3, 1500, true))).startsWith("Among the free riders who can reach "
            + "the kitchen within 4.5 minutes of the soonest, the one who has earned the least per online hour today hears first");
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 1, 333, true))).startsWith("Among the free riders who can reach "
            + "the kitchen within 1 minute of the soonest");

        OfferRules now = new OfferRules(3, 1, 40, 5000, 0);
        OfferRules then = new OfferRules(1, 3, 30, 5000, 1500);
        Instant at = Instant.parse("2026-11-20T00:00:00Z");
        Terms terms = FleetRiderService.terms(DRAFT, 130, new TermsChange(at, DRAFT, false, 130, 130, DispatchRules.TODAY,
            new DispatchRules(1, 3, 1500)), "en", "", now, then);
        assertThat(terms.offerRules()).isEqualTo(now);
        assertThat(terms.upcoming().offerRules()).isEqualTo(then);
        assertThat(terms.upcoming().summaryOfChanges()).containsExactly("How orders are offered changes: " + fair);
        assertThat(FleetRiderService.terms(DRAFT, 130, new TermsChange(at, DRAFT, false, 130, 150), "en", "").upcoming()
            .summaryOfChanges()).as("the same rules: no line").hasSize(1);
    }

    @Test
    void teluguAndHindiFallBackToEnglishUntilTranslated() {
        assertThat(FleetRiderService.terms(DRAFT, 130, null, "te", "").summaryOfChanges())
            .containsExactly("First version of the Craves rider terms. Draft pricing, not final.");
    }

    @Test
    void formatsRupeesAndKilometres() {
        assertThat(FleetRiderService.rupees(4000)).isEqualTo("₹40");
        assertThat(FleetRiderService.rupees(150)).isEqualTo("₹1.50");
        assertThat(FleetRiderService.rupees(4050)).isEqualTo("₹40.50");
        assertThat(FleetRiderService.km(1500)).isEqualTo("1.5");
        assertThat(FleetRiderService.km(2000)).isEqualTo("2");
    }
}
