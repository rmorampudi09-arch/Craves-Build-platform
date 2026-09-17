package in.craves.integration.finance;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Explicit operator prices; no implicit tariff, rounding choice, or road-distance fallback. */
public record DeliveryTariff(String baseCharge, String includedKm, String perKmCharge,
    String maximumKm, DistanceBasis distanceBasis, Increment increment) {
    public enum DistanceBasis { STRAIGHT_LINE, ROAD_ROUTE }
    public enum Increment { PRO_RATA, STARTED_KILOMETRE }
    public record Quote(String distanceKm, String beforeTax, String gst, String total,
        DistanceBasis distanceBasis, Increment increment) {}

    public DeliveryTariff {
        baseCharge = exactMoney(baseCharge); perKmCharge = exactMoney(perKmCharge);
        includedKm = distance(includedKm).toPlainString(); maximumKm = distance(maximumKm).toPlainString();
        Objects.requireNonNull(distanceBasis, "Choose the distance basis");
        Objects.requireNonNull(increment, "Choose the distance billing increment");
        if (new BigDecimal(maximumKm).signum() <= 0 || new BigDecimal(includedKm).compareTo(new BigDecimal(maximumKm)) > 0)
            throw new IllegalArgumentException("Included distance must not exceed a positive maximum distance");
    }
    public Quote quote(String measuredKm, String gstRate) {
        var km = distance(measuredKm);
        if (km.compareTo(new BigDecimal(maximumKm)) > 0) throw new IllegalArgumentException("Delivery address is outside the configured service distance");
        var extra = km.subtract(new BigDecimal(includedKm)).max(BigDecimal.ZERO);
        if (increment == Increment.STARTED_KILOMETRE) extra = extra.setScale(0, RoundingMode.CEILING);
        var charge = new BigDecimal(baseCharge).add(extra.multiply(new BigDecimal(perKmCharge))).setScale(2, RoundingMode.HALF_UP);
        var tax = FinanceCalculations.percent(charge, gstRate);
        return new Quote(km.toPlainString(), LedgerMoney.text(charge), LedgerMoney.text(tax),
            LedgerMoney.text(charge.add(tax)), distanceBasis, increment);
    }
    public Quote between(BigDecimal pickupLatitude, BigDecimal pickupLongitude, BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude, String gstRate) {
        if (distanceBasis != DistanceBasis.STRAIGHT_LINE)
            throw new IllegalStateException("Verified road-route distance is not connected; straight-line substitution is not permitted");
        coordinate(pickupLatitude, 90); coordinate(dropoffLatitude, 90);
        coordinate(pickupLongitude, 180); coordinate(dropoffLongitude, 180);
        double first = Math.toRadians(pickupLatitude.doubleValue()), second = Math.toRadians(dropoffLatitude.doubleValue());
        double lat = (second - first) / 2, lon = Math.toRadians(dropoffLongitude.subtract(pickupLongitude).doubleValue()) / 2;
        double a = Math.sin(lat) * Math.sin(lat) + Math.cos(first) * Math.cos(second) * Math.sin(lon) * Math.sin(lon);
        double km = 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
        // Bill and validate the same metre-rounded distance, recorded in the immutable order snapshot.
        return quote(BigDecimal.valueOf(km).setScale(3, RoundingMode.HALF_UP).toPlainString(), gstRate);
    }
    private static void coordinate(BigDecimal value, int bound) {
        if (value == null || value.abs().compareTo(BigDecimal.valueOf(bound)) > 0)
            throw new IllegalArgumentException("Verified pickup and delivery coordinates are required");
    }
    private static String exactMoney(String value) {
        if (value == null || !value.matches("[0-9]{1,8}\\.[0-9]{2}")) throw new IllegalArgumentException("Tariff prices require nonnegative rupees and exact paise");
        return LedgerMoney.text(LedgerMoney.parse(value));
    }
    private static BigDecimal distance(String value) {
        if (value == null || !value.matches("[0-9]{1,5}(\\.[0-9]{1,3})?")) throw new IllegalArgumentException("Distance requires nonnegative kilometres, to at most three decimal places");
        return new BigDecimal(value);
    }
}
