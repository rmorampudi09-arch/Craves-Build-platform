package in.craves.integration.fleet.pay;

import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.trip.PayLine;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

/**
 * Rider pay (PLAN "Pay formula", F7), pure and in integer paise:
 * pay = base + drop km after the base km + pickup km after the free km + waiting after the free minutes + event fees.
 * Kilometres and minutes are paid pro rata and rounded half up to the paisa. The offer locks the rate card version and
 * both distances; every ending below is computed from those locked values.
 */
public final class FleetPay {
    /** Offer lines, short so the app can join them into one sentence ("₹40 base + ₹13.50 drop distance"). */
    static final Map<String, String> OFFER_LABELS = Map.of("base", "base", "drop-km", "drop distance", "pickup-km", "ride to the kitchen");
    /** Lines on the finished trip and in earnings. */
    public static final Map<String, String> FINAL_LABELS = Map.of("base", "Base pay", "drop-km", "Drop distance",
        "pickup-km", "Ride to the kitchen", "waiting", "Waiting at the kitchen", "cancellation", "Cancellation fee",
        "return-km", "Return to the kitchen");

    private FleetPay() {
    }

    /** How a trip ended, for the trip-state pay table in PLAN. */
    public enum Ending {
        /** Delivered (OTP, or photo after the unreachable flow): full pay plus waiting. */
        DELIVERED,
        /** Customer unreachable after the set wait and two calls: full pay plus waiting. */
        CUSTOMER_UNREACHABLE,
        /** Failed or cancelled after pickup: full pay, waiting and the return to the kitchen. */
        FAILED_AFTER_PICKUP,
        /** Cancelled while riding to the kitchen: pickup-leg pay. */
        CANCELLED_TO_KITCHEN,
        /** Cancelled at the kitchen: cancellation fee, pickup-leg pay and any waiting past the free minutes. */
        CANCELLED_AT_KITCHEN
    }

    public record PayQuote(String rateCardVersion, int dropDistanceM, int pickupDistanceM, List<PayLine> lines, long totalPaise) {
    }

    /** The locked pay an offer shows before accepting. */
    public static PayQuote quote(RateCard card, int dropDistanceM, int pickupDistanceM) {
        List<PayLine> lines = new ArrayList<>();
        add(lines, OFFER_LABELS, "base", card.basePaise());
        add(lines, OFFER_LABELS, "drop-km", kmPay(card.dropPerKmPaise(), dropDistanceM, card.baseDropM()));
        add(lines, OFFER_LABELS, "pickup-km", kmPay(card.pickupPerKmPaise(), pickupDistanceM, card.pickupFreeM()));
        return new PayQuote(card.version(), dropDistanceM, pickupDistanceM, List.copyOf(lines), total(lines));
    }

    /** The pay a trip ends with, from its locked card and distances and the paid waiting seconds. */
    public static List<PayLine> finalLines(RateCard card, Ending ending, int dropDistanceM, int pickupDistanceM, long waitSeconds) {
        List<PayLine> lines = new ArrayList<>();
        long pickupPay = kmPay(card.pickupPerKmPaise(), pickupDistanceM, card.pickupFreeM());
        switch (ending) {
            case CANCELLED_TO_KITCHEN -> add(lines, FINAL_LABELS, "pickup-km", pickupPay);
            case CANCELLED_AT_KITCHEN -> {
                add(lines, FINAL_LABELS, "cancellation", card.cancellationFeePaise());
                add(lines, FINAL_LABELS, "pickup-km", pickupPay);
                add(lines, FINAL_LABELS, "waiting", waitPay(card, waitSeconds));
            }
            default -> {
                add(lines, FINAL_LABELS, "base", card.basePaise());
                add(lines, FINAL_LABELS, "drop-km", kmPay(card.dropPerKmPaise(), dropDistanceM, card.baseDropM()));
                add(lines, FINAL_LABELS, "pickup-km", pickupPay);
                add(lines, FINAL_LABELS, "waiting", waitPay(card, waitSeconds));
                if (ending == Ending.FAILED_AFTER_PICKUP) {
                    add(lines, FINAL_LABELS, "return-km", kmPay(card.returnPerKmPaise(), dropDistanceM, 0));
                }
            }
        }
        return List.copyOf(lines);
    }

    public static long total(List<PayLine> lines) {
        return lines.stream().mapToLong(PayLine::amountPaise).sum();
    }

    /** Pickup km: the straight line from the rider to the kitchen times the policy's detour factor. */
    public static int pickupDistanceM(double straightLineM, int detourPercent) {
        return (int) Math.round(straightLineM * detourPercent / 100.0);
    }

    /** Seconds waited at the kitchen: from the later of arrival inside the kitchen zone and the chef's ready time, until handover. */
    public static long waitSeconds(Instant arrivedKitchenAt, Instant chefReadyAt, Instant handoverAt) {
        if (arrivedKitchenAt == null || handoverAt == null) {
            return 0;
        }
        Instant from = chefReadyAt != null && chefReadyAt.isAfter(arrivedKitchenAt) ? chefReadyAt : arrivedKitchenAt;
        return Math.max(0, Duration.between(from, handoverAt).getSeconds());
    }

    public static long waitPay(RateCard card, long waitSeconds) {
        long paidSeconds = Math.max(0, waitSeconds - card.waitFreeMinutes() * 60L);
        return roundDiv(paidSeconds * card.waitPerMinutePaise(), 60);
    }

    /**
     * Offer to riders only when locked pay plus the per-order overhead is at most the live Borzo or Pidge quote plus the
     * reliability premium. With no courier quote at all, riders are the only way to deliver, so the guard passes.
     */
    public static boolean costGuardPasses(long payPaise, long overheadPaise, OptionalLong thirdPartyQuotePaise, long premiumPaise) {
        return thirdPartyQuotePaise.isEmpty() || payPaise + overheadPaise <= thirdPartyQuotePaise.getAsLong() + premiumPaise;
    }

    /** The slot's guaranteed minimum for the seconds online inside the zone. */
    public static long slotGuarantee(long guaranteedPerHourPaise, long onlineInZoneSeconds) {
        return roundDiv(guaranteedPerHourPaise * onlineInZoneSeconds, 3600);
    }

    /** What tops trip pay up to the guarantee; never negative, so a busy slot pays only its trips. */
    public static long slotTopUp(long guaranteedPaise, long tripPayPaise) {
        return Math.max(0, guaranteedPaise - tripPayPaise);
    }

    static long kmPay(long perKmPaise, int metres, int freeMetres) {
        return roundDiv(Math.max(0, metres - freeMetres) * perKmPaise, 1000);
    }

    private static long roundDiv(long value, long divisor) {
        return (value + divisor / 2) / divisor;
    }

    private static void add(List<PayLine> lines, Map<String, String> labels, String component, long paise) {
        if (paise > 0) {
            lines.add(new PayLine(component, labels.get(component), paise));
        }
    }
}
