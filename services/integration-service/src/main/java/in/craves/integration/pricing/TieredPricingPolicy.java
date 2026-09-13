package in.craves.integration.pricing;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/** An immutable resolved policy. Creating or previewing one does not activate a commercial rate. */
public record TieredPricingPolicy(String version, Purpose purpose, String currency, Mode mode,
                                 List<Tier> tiers, BigDecimal ceiling) {
    public enum Purpose { CHEF_SERVICE_FEE, CUSTOMER_UPLIFT }
    public enum Mode { PROGRESSIVE, WHOLE_AMOUNT_BAND }
    public record Tier(BigDecimal upperBound, BigDecimal percentage) {
        public Tier {
            if (upperBound != null) upperBound = LedgerMoney.amount(upperBound);
            Objects.requireNonNull(percentage, "percentage is required");
            if (percentage.signum() < 0 || percentage.compareTo(new BigDecimal("100")) > 0 || percentage.scale() > 6)
                throw new IllegalArgumentException("percentage must be between 0 and 100 with at most six decimal places");
            percentage = percentage.stripTrailingZeros();
        }
    }
    public record FeeSnapshot(TieredPricingPolicy policy, String policyHash, String basis,
                              String baseAmount, String commissionAmount, String rounding) {}

    public TieredPricingPolicy {
        if (version == null || !version.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,119}"))
            throw new IllegalArgumentException("a stable policy version is required");
        Objects.requireNonNull(purpose, "purpose is required");
        LedgerMoney.currency(currency);
        Objects.requireNonNull(mode, "mode is required");
        if (tiers == null || tiers.isEmpty() || tiers.size() > 50)
            throw new IllegalArgumentException("between 1 and 50 tiers are required");
        tiers = List.copyOf(tiers);
        BigDecimal previous = BigDecimal.ZERO;
        for (int i = 0; i < tiers.size(); i++) {
            Tier tier = Objects.requireNonNull(tiers.get(i), "tier is required");
            if (i == tiers.size() - 1) {
                if (tier.upperBound() != null) throw new IllegalArgumentException("last tier must be unbounded");
            } else {
                if (tier.upperBound() == null || tier.upperBound().compareTo(previous) <= 0)
                    throw new IllegalArgumentException("tier bounds must be positive and strictly increasing");
                previous = tier.upperBound();
            }
        }
        if (ceiling != null) ceiling = LedgerMoney.amount(ceiling);
    }

    public static TieredPricingPolicy flatChefSeven() {
        return new TieredPricingPolicy("chef-flat-7-v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE,
            List.of(new Tier(null, new BigDecimal("7"))), null);
    }

    /** Proposal from the reference, usable for simulation only until separately approved. */
    public static TieredPricingPolicy proposedCustomerCeiling() {
        return new TieredPricingPolicy("customer-progressive-proposal-v1", Purpose.CUSTOMER_UPLIFT, "INR", Mode.PROGRESSIVE,
            List.of(new Tier(new BigDecimal("200"), new BigDecimal("8")),
                new Tier(new BigDecimal("400"), new BigDecimal("6")),
                new Tier(new BigDecimal("700"), new BigDecimal("5")), new Tier(null, new BigDecimal("4"))),
            new BigDecimal("50"));
    }

    public BigDecimal calculate(BigDecimal base) {
        base = LedgerMoney.amount(base);
        BigDecimal result = BigDecimal.ZERO;
        BigDecimal lower = BigDecimal.ZERO;
        for (Tier tier : tiers) {
            if (mode == Mode.WHOLE_AMOUNT_BAND) {
                if (tier.upperBound() == null || base.compareTo(tier.upperBound()) <= 0) {
                    result = base.multiply(tier.percentage()).movePointLeft(2); break;
                }
            } else {
                BigDecimal upper = tier.upperBound() == null ? base : base.min(tier.upperBound());
                BigDecimal width = upper.subtract(lower).max(BigDecimal.ZERO);
                result = result.add(width.multiply(tier.percentage()).movePointLeft(2));
                if (tier.upperBound() == null || base.compareTo(tier.upperBound()) <= 0) break;
                lower = tier.upperBound();
            }
        }
        result = result.setScale(2, RoundingMode.HALF_UP);
        return ceiling == null ? result : result.min(ceiling);
    }

    public FeeSnapshot snapshot(BigDecimal base) {
        return new FeeSnapshot(this, hash(), purpose == Purpose.CHEF_SERVICE_FEE ? "CHEF_ORDER_GROSS" : "CHEF_DISH_UNIT_BASE",
            LedgerMoney.text(base), LedgerMoney.text(calculate(base)), "HALF_UP_2DP");
    }

    public BigDecimal publishWithinCeiling(BigDecimal chefBase, BigDecimal desiredCustomerPrice) {
        if (purpose != Purpose.CUSTOMER_UPLIFT) throw new IllegalArgumentException("a customer uplift policy is required");
        BigDecimal base = LedgerMoney.amount(chefBase);
        BigDecimal requested = LedgerMoney.amount(desiredCustomerPrice);
        BigDecimal maximum = base.add(calculate(base));
        if (requested.compareTo(base) < 0 || requested.compareTo(maximum) > 0)
            throw new IllegalArgumentException("published price must stay between chef base and uplift ceiling");
        return requested;
    }

    public String hash() {
        StringBuilder value = new StringBuilder(version).append('|').append(purpose).append('|').append(currency)
            .append('|').append(mode).append('|').append(ceiling == null ? "none" : ceiling.toPlainString());
        for (Tier tier : tiers) value.append('|').append(tier.upperBound() == null ? "unbounded" : tier.upperBound().toPlainString())
            .append(':').append(tier.percentage().toPlainString());
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
