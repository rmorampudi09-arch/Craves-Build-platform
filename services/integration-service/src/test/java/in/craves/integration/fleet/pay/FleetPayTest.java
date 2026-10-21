package in.craves.integration.fleet.pay;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.pay.FleetPay.PayQuote;
import in.craves.integration.fleet.trip.PayLine;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

/** Worked examples on the seeded draft rate card 2026-10-v1. */
class FleetPayTest {
    // Base ₹40 for the first 2 km of the drop, ₹9 a drop km after, ₹9 a pickup km after the first 1 km, ₹1.50 a minute after
    // 8 free minutes; event fees: ₹20 cancellation at the kitchen, ₹9 a km to return the food; 10 minutes' unreachable wait.
    static final RateCard DRAFT = new RateCard("2026-10-v1", true, Instant.parse("2026-11-03T18:30:00Z"), 4000, 2000, 900, 1000, 900,
        8, 150, 8000, Map.of(), Map.of(), null, 2000, 900, 10);

    @ParameterizedTest(name = "drop {0} m, pickup {1} m: {2} + {3} + {4} = {5}")
    @CsvSource({
        // drop m, pickup m, base, drop km pay, pickup km pay, total
        "1500, 800,  4000, 0,    0,    4000",
        "2000, 1000, 4000, 0,    0,    4000",
        "3500, 1800, 4000, 1350, 720,  6070",
        "5000, 2500, 4000, 2700, 1350, 8050",
        "3333, 1000, 4000, 1200, 0,    5200", // 1.333 km x ₹9 = ₹11.997, rounded to the paisa
        "2001, 1001, 4000, 1,    1,    4002",
    })
    void theOfferLocksBasePlusDropAndPickupKilometres(int drop, int pickup, long base, long dropPay, long pickupPay, long total) {
        PayQuote quote = FleetPay.quote(DRAFT, drop, pickup);
        assertThat(quote.rateCardVersion()).isEqualTo("2026-10-v1");
        assertThat(quote.dropDistanceM()).isEqualTo(drop);
        assertThat(quote.pickupDistanceM()).isEqualTo(pickup);
        assertThat(quote.totalPaise()).isEqualTo(total);
        assertThat(quote.lines()).extracting(PayLine::amountPaise).containsExactlyElementsOf(
            java.util.stream.Stream.of(base, dropPay, pickupPay).filter(amount -> amount > 0).toList());
        assertThat(quote.lines().get(0)).isEqualTo(new PayLine("base", "base", 4000));
        assertThat(quote.lines().stream().mapToLong(PayLine::amountPaise).sum()).isEqualTo(quote.totalPaise());
    }

    @Test
    void offerLabelsReadAsOneSentence() {
        assertThat(FleetPay.quote(DRAFT, 3500, 1800).lines()).extracting(PayLine::label)
            .containsExactly("base", "drop distance", "ride to the kitchen");
    }

    @Test
    void pickupDistanceIsTheStraightLineTimesTheDetourFactor() {
        assertThat(FleetPay.pickupDistanceM(1385, 130)).isEqualTo(1801); // 1800.5, rounded half up
        assertThat(FleetPay.pickupDistanceM(1000, 100)).isEqualTo(1000);
    }

    @ParameterizedTest(name = "arrived {0}, ready {1}, handed over {2}: {3} s, ₹{4}")
    @CsvSource({
        // the free wait starts at the later of arrival and ready, and stops at handover
        "12:00, 12:05, 12:16, 660, 450", // 11 min from ready, 3 paid minutes
        "12:10, 12:05, 12:20, 600, 300", // 10 min from arrival
        "12:00, ,      12:08:30, 510, 75", // no ready time yet: from arrival; 30 s paid
        "12:00, 12:30, 12:20, 0,   0",   // handed over before the ready time
        ",      12:05, 12:30, 0,   0",   // never arrived inside the kitchen zone: no waiting pay
    })
    void waitingPayRunsFromTheLaterOfArrivalAndReadyUntilHandover(String arrived, String ready, String handover, long seconds,
                                                                 long paise) {
        long wait = FleetPay.waitSeconds(at(arrived), at(ready), at(handover));
        assertThat(wait).isEqualTo(seconds);
        assertThat(FleetPay.waitPay(DRAFT, wait)).isEqualTo(paise);
    }

    @Test
    void tripStatePayRules() {
        long wait = 11 * 60; // 3 paid minutes, ₹4.50
        assertThat(lines(Ending.DELIVERED, wait)).containsExactly(
            line("base", 4000), line("drop-km", 1350), line("pickup-km", 720), line("waiting", 450));
        assertThat(lines(Ending.CUSTOMER_UNREACHABLE, 0)).as("full pay after the unreachable wait")
            .containsExactly(line("base", 4000), line("drop-km", 1350), line("pickup-km", 720));
        assertThat(lines(Ending.FAILED_AFTER_PICKUP, 0)).as("full pay plus the return to the kitchen")
            .containsExactly(line("base", 4000), line("drop-km", 1350), line("pickup-km", 720), line("return-km", 3150));
        assertThat(lines(Ending.CANCELLED_TO_KITCHEN, 0)).as("pickup-leg pay").containsExactly(line("pickup-km", 720));
        assertThat(lines(Ending.CANCELLED_AT_KITCHEN, wait)).as("cancellation fee, pickup leg and the chef's late minutes")
            .containsExactly(line("cancellation", 2000), line("pickup-km", 720), line("waiting", 450));
        assertThat(FleetPay.finalLines(DRAFT, Ending.CANCELLED_TO_KITCHEN, 3500, 800, 0)).as("inside the free pickup km").isEmpty();
        assertThat(FleetPay.finalLines(DRAFT, Ending.DELIVERED, 3500, 1800, 0).get(0))
            .isEqualTo(new PayLine("base", "Base pay", 4000));
    }

    @Test
    void theCostGuardOffersOnlyWhenPayAndOverheadStayWithinTheThirdPartyQuoteAndPremium() {
        assertThat(FleetPay.costGuardPasses(6070, 500, OptionalLong.of(5800), 1000)).isTrue(); // 6570 <= 6800
        assertThat(FleetPay.costGuardPasses(6300, 500, OptionalLong.of(5800), 1000)).isTrue(); // 6800 <= 6800
        assertThat(FleetPay.costGuardPasses(8050, 500, OptionalLong.of(5800), 1000)).isFalse();
        assertThat(FleetPay.costGuardPasses(8050, 500, OptionalLong.empty(), 1000)).as("no courier quoted: riders are the only option")
            .isTrue();
    }

    @Test
    void slotTopUpIsTheGuaranteeForOnlineInZoneTimeLessTripPay() {
        assertThat(FleetPay.slotGuarantee(8000, 3 * 3600)).isEqualTo(24000);
        assertThat(FleetPay.slotGuarantee(8000, 5400)).isEqualTo(12000);
        assertThat(FleetPay.slotGuarantee(8000, 1)).isEqualTo(2); // 2.22, rounded
        assertThat(FleetPay.slotTopUp(24000, 18500)).isEqualTo(5500);
        assertThat(FleetPay.slotTopUp(24000, 30000)).isZero();
    }

    private static List<PayLine> lines(Ending ending, long waitSeconds) {
        return FleetPay.finalLines(DRAFT, ending, 3500, 1800, waitSeconds);
    }

    private static PayLine line(String component, long paise) {
        return new PayLine(component, FleetPay.FINAL_LABELS.get(component), paise);
    }

    private static Instant at(String clock) {
        if (clock == null || clock.isBlank()) {
            return null;
        }
        return java.time.OffsetDateTime.parse("2026-11-10T" + (clock.length() == 5 ? clock + ":00" : clock) + "+05:30").toInstant();
    }
}
