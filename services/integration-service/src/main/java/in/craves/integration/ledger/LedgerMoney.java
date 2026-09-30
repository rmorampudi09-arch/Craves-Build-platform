package in.craves.integration.ledger;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/** Exact posted money. Percentage intermediates are rounded by the policy, not here. */
public final class LedgerMoney {
    public static final BigDecimal ZERO = new BigDecimal("0.00");
    private static final BigDecimal LIMIT = new BigDecimal("100000000000000.00");
    private LedgerMoney() {}

    public static BigDecimal signed(BigDecimal value) {
        Objects.requireNonNull(value, "amount is required");
        if (value.abs().compareTo(LIMIT) >= 0) throw new IllegalArgumentException("amount exceeds ledger limit");
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException exception) { throw new IllegalArgumentException("amount must be exact paise", exception); }
    }

    public static BigDecimal amount(BigDecimal value) {
        BigDecimal result = signed(value);
        if (result.signum() < 0) throw new IllegalArgumentException("amount cannot be negative");
        return result;
    }

    public static BigDecimal parse(String value) {
        if (value == null || !value.matches("[0-9]{1,14}(\\.[0-9]{1,2})?"))
            throw new IllegalArgumentException("amount must be a non-negative decimal string with at most two decimal places");
        return amount(new BigDecimal(value));
    }

    public static String text(BigDecimal value) { return signed(value).toPlainString(); }

    public static String currency(String value) {
        if (!"INR".equals(value)) throw new IllegalArgumentException("this ledger release supports INR only");
        return value;
    }

    /** Largest remainder using integer paise. Equal remainders go to lexical stable IDs. */
    public static Map<String, BigDecimal> allocate(BigDecimal total, Map<String, BigDecimal> weights) {
        BigInteger units = amount(total).movePointRight(2).toBigIntegerExact();
        if (weights == null || weights.isEmpty() || weights.size() > 500)
            throw new IllegalArgumentException("between 1 and 500 allocation weights are required");
        TreeMap<String, BigInteger> ordered = new TreeMap<>();
        for (var entry : weights.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()) throw new IllegalArgumentException("allocation ID is required");
            ordered.put(entry.getKey(), amount(entry.getValue()).movePointRight(2).toBigIntegerExact());
        }
        BigInteger denominator = ordered.values().stream().reduce(BigInteger.ZERO, BigInteger::add);
        if (denominator.signum() == 0 && units.signum() != 0)
            throw new IllegalArgumentException("positive total requires a positive allocation weight");
        record Remainder(String id, BigInteger remainder) {}
        var remainders = new ArrayList<Remainder>();
        Map<String, BigInteger> allocated = new LinkedHashMap<>();
        BigInteger assigned = BigInteger.ZERO;
        for (var entry : ordered.entrySet()) {
            BigInteger[] qr = denominator.signum() == 0 ? new BigInteger[]{BigInteger.ZERO, BigInteger.ZERO}
                : units.multiply(entry.getValue()).divideAndRemainder(denominator);
            allocated.put(entry.getKey(), qr[0]); assigned = assigned.add(qr[0]);
            remainders.add(new Remainder(entry.getKey(), qr[1]));
        }
        remainders.sort(Comparator.comparing(Remainder::remainder).reversed().thenComparing(Remainder::id));
        int residual = units.subtract(assigned).intValueExact();
        for (int i = 0; i < residual; i++) allocated.compute(remainders.get(i).id(), (key, value) -> value.add(BigInteger.ONE));
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        allocated.forEach((id, value) -> result.put(id, new BigDecimal(value, 2)));
        return Collections.unmodifiableMap(result);
    }
}
