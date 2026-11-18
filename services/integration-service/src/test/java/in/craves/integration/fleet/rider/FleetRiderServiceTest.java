package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.FleetPolicyStore.DispatchRules;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetPolicyStore.SearchRings;
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

    /** Rain mode (R16 19): the card's rain top-up is part of the pay terms, shown only when the card has one. */
    @Test
    void aRainTopUpIsATermsLineOnlyWhenTheCardHasOne() {
        RateCard rainy = new RateCard("2026-12-v2", false, DRAFT.effectiveFrom(), 4000, 2000, 900, 1000, 900, 8, 150, 8000, Map.of(),
            DRAFT.summaryOfChanges(), null, 2000, 900, 10, 2000);
        List<LabelValue> lines = FleetRiderService.terms(rainy, 130, null, "en", "").rateCardLines();
        assertThat(lines.subList(lines.size() - 2, lines.size())).containsExactly(
            new LabelValue("Rain top-up, each order offered while rain mode is on", "₹20"), new LabelValue("Declining or missing an offer", "Free"));
        assertThat(FleetRiderService.terms(DRAFT, 130, null, "en", "").rateCardLines()).noneMatch(line -> line.label().startsWith("Rain"));
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

    /** Search rings (V198): the radius by the stage's age, never beyond the policy radius, and an empty ring passed over. */
    @Test
    void searchRingsNarrowTheRadiusByTheStagesAgeAndNeverWaitOnAnEmptyRing() {
        SearchRings rings = new SearchRings(2000, 100, 3500, 200);
        assertThat(SearchRings.NONE.on()).isFalse();
        assertThat(SearchRings.NONE.radiusM(0, 5000, 10)).as("no rings: the policy radius from the start").isEqualTo(5000);
        assertThat(rings.on()).isTrue();
        assertThat(rings.radiusM(0, 5000, 500)).isEqualTo(2000);
        assertThat(rings.radiusM(99, 5000, 2000)).isEqualTo(2000);
        assertThat(rings.radiusM(100, 5000, 500)).as("the first ring's time is up").isEqualTo(3500);
        assertThat(rings.radiusM(199, 5000, 500)).isEqualTo(3500);
        assertThat(rings.radiusM(200, 5000, 500)).as("then the policy radius").isEqualTo(5000);
        assertThat(rings.radiusM(0, 5000, 2001)).as("nobody free in the first ring: the second at once").isEqualTo(3500);
        assertThat(rings.radiusM(0, 5000, 4000)).as("nobody free in either").isEqualTo(5000);
        assertThat(rings.radiusM(0, 5000, Double.MAX_VALUE)).as("nobody free at all").isEqualTo(5000);
        assertThat(rings.radiusM(0, 1500, 500)).as("ops shrank the radius: no ring exceeds it").isEqualTo(1500);
        assertThat(rings.radiusM(150, 3000, 500)).isEqualTo(3000);
        assertThat(new SearchRings(0, 0, 3500, 200).radiusM(0, 5000, 500)).as("one ring only").isEqualTo(3500);

        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 0, 0, false, false, false, rings))).isEqualTo("The nearest free "
            + "rider hears first, one rider at a time. If nobody accepts, riders are asked again until the order's time with Craves riders "
            + "is up. Riders nearer the kitchen are asked first: for the first 100 seconds only riders within 2 km, then until 200 seconds "
            + "only riders within 3.5 km, then every rider in range. If no free rider is that near, riders farther away are asked at once. "
            + "Declining is free.");
        assertThat(FleetRiderService.ringsLine(SearchRings.NONE)).isEmpty();
    }

    /** Odd values: SearchRings alone decides which rings are in force, so dispatch and the line riders read agree. */
    @Test
    void aRingThatIsNotInForceNeitherNarrowsTheSearchNorIsTold() {
        // A size without a time: the first ring is not in force; the second is, from the start.
        SearchRings noFirstTime = new SearchRings(2000, 0, 3500, 200);
        assertThat(noFirstTime.first()).isFalse();
        assertThat(noFirstTime.second()).isTrue();
        assertThat(noFirstTime.radiusM(0, 5000, 500)).isEqualTo(3500);
        assertThat(noFirstTime.boundarySeconds()).containsExactly(200);
        assertThat(FleetRiderService.ringsLine(noFirstTime)).isEqualTo(" Riders nearer the kitchen are asked first: until 200 seconds only "
            + "riders within 3.5 km, then every rider in range. If no free rider is that near, riders farther away are asked at once.");
        assertThat(new SearchRings(0, 100, 3500, 200).first()).as("a time without a size").isFalse();

        // A second ring no later, or no wider, than the first is not in force: after the first comes the whole radius.
        for (SearchRings oneRing : List.of(new SearchRings(2000, 100, 3500, 100), new SearchRings(2000, 100, 3500, 50),
            new SearchRings(2000, 100, 2000, 200), new SearchRings(2000, 100, 1500, 200), new SearchRings(2000, 100, 3500, 0))) {
            assertThat(oneRing.first()).as(oneRing.toString()).isTrue();
            assertThat(oneRing.second()).as(oneRing.toString()).isFalse();
            assertThat(oneRing.radiusM(0, 5000, 500)).as(oneRing.toString()).isEqualTo(2000);
            assertThat(oneRing.radiusM(0, 5000, 2500)).as(oneRing + ": nobody in the first ring").isEqualTo(5000);
            assertThat(oneRing.radiusM(150, 5000, 500)).as(oneRing + ": after the first ring's time").isEqualTo(5000);
            assertThat(oneRing.boundarySeconds()).as(oneRing.toString()).containsExactly(100);
            assertThat(FleetRiderService.ringsLine(oneRing)).as(oneRing.toString()).isEqualTo(" Riders nearer the kitchen are asked "
                + "first: for the first 100 seconds only riders within 2 km, then every rider in range. If no free rider is that near, "
                + "riders farther away are asked at once.");
        }

        // Neither in force: no rings at all.
        for (SearchRings none : List.of(new SearchRings(2000, 0, 0, 100), new SearchRings(0, 100, 0, 200), new SearchRings(2000, 0, 3500, 0))) {
            assertThat(none.on()).as(none.toString()).isFalse();
            assertThat(none.radiusM(0, 5000, 500)).as(none.toString()).isEqualTo(5000);
            assertThat(none.boundarySeconds()).as(none.toString()).isEmpty();
            assertThat(FleetRiderService.ringsLine(none)).as(none.toString()).isEmpty();
        }
        assertThat(new SearchRings(2000, 100, 3500, 200).boundarySeconds()).containsExactly(100, 200);
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
        // No limit on rounds (0): the order stays with Craves riders, who are asked again.
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 0, 1500))).isEqualTo("Among the free riders within 1.5 km of the "
            + "nearest, the one who has earned the least per online hour today hears first, one rider at a time. If nobody accepts, riders "
            + "are asked again until the order's time with Craves riders is up. Declining is free.");

        // Phase 5: ranked by travel time, "nearest" is the soonest at the kitchen, and the band is counted in minutes.
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 1, 0, true))).isEqualTo("The free rider who can reach the kitchen "
            + "soonest hears first, one rider at a time. Soonest is by Craves's travel-time estimate; without one, the nearest hear first. "
            + "Declining is free.");
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 3, 1500, true))).startsWith("Among the free riders who can reach "
            + "the kitchen within 4.5 minutes of the soonest, the one who has earned the least per online hour today hears first");
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 1, 333, true))).startsWith("Among the free riders who can reach "
            + "the kitchen within 1 minute of the soonest");

        // Policy 2026-11-v2 (app 1.3.3): two more lines riders are shown, before the dispatcher acts on them.
        assertThat(FleetRiderService.offerRulesLine(new DispatchRules(1, 3, 1500, false, true, true))).isEqualTo("Among the free riders "
            + "within 1.5 km of the nearest, the one who has earned the least per online hour today hears first, one rider at a time, in up "
            + "to 3 rounds. Orders near each other are shared out among the free riders nearby together, not one by one. You may hear of "
            + "your next order before this one ends; it waits for you. Declining is free.");

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
