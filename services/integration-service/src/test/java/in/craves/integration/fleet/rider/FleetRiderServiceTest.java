package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.rider.FleetRiderModels.LabelValue;
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
        Terms terms = FleetRiderService.terms(DRAFT, null, "en", "+914012345678");
        assertThat(terms.rateCardLines()).containsExactly(
            new LabelValue("Base pay, first 2 km of the drop", "₹40"),
            new LabelValue("Each drop km after 2 km", "₹9"),
            new LabelValue("Ride to the kitchen, each km after the first 1 km", "₹9"),
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
    void anUpcomingCardIsShownWithTheSameLinesInTheRidersLanguage() {
        RateCard next = new RateCard("2026-12-v2", false, Instant.parse("2026-12-01T18:30:00Z"), 4500, 2000, 900, 1000, 900, 8, 150, 8000,
            Map.of(), Map.of("en", List.of("Base pay goes up to ₹45."), "te", List.of("బేస్ పే ₹45.")), null);
        Terms terms = FleetRiderService.terms(DRAFT, next, "te", "");
        assertThat(terms.version()).isEqualTo("2026-10-v1");
        assertThat(terms.upcoming().version()).isEqualTo("2026-12-v2");
        assertThat(terms.upcoming().effectiveFrom()).isEqualTo(next.effectiveFrom());
        assertThat(terms.upcoming().summaryOfChanges()).containsExactly("బేస్ పే ₹45.");
        assertThat(terms.upcoming().rateCardLines().get(0)).isEqualTo(new LabelValue("Base pay, first 2 km of the drop", "₹45"));
        assertThat(terms.upcoming().rateCardLines()).hasSameSizeAs(terms.rateCardLines());
        assertThat(FleetRiderService.terms(DRAFT, null, "en", "").upcoming()).isNull();
    }

    @Test
    void teluguAndHindiFallBackToEnglishUntilTranslated() {
        assertThat(FleetRiderService.terms(DRAFT, null, "te", "").summaryOfChanges())
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
