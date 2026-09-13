package in.craves.integration.ledger;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Economic content is separate from workflow status and transport retries. */
public final class LedgerJournal {
    private LedgerJournal() {}
    public enum Outcome { POSTED, REPLAY, CONFLICT }
    public record Receipt(UUID transactionId, Outcome outcome, String businessEventKey) {}
    public record Line(String accountCode, String currency, String debit, String credit,
                       UUID chefIdentityId, UUID deliveryAttemptId, String providerId,
                       UUID paymentId, UUID refundId, UUID payoutInstructionId) {
        public Line {
            if (accountCode == null || !accountCode.matches("[A-Z][A-Z0-9_]{1,59}"))
                throw new IllegalArgumentException("account code is required");
            LedgerMoney.currency(currency);
            BigDecimal dr = LedgerMoney.parse(debit), cr = LedgerMoney.parse(credit);
            if ((dr.signum() > 0) == (cr.signum() > 0))
                throw new IllegalArgumentException("a journal line must have exactly one positive debit or credit");
            debit = dr.toPlainString(); credit = cr.toPlainString();
            if (providerId != null && !providerId.matches("[A-Za-z0-9_-]{1,80}"))
                throw new IllegalArgumentException("invalid provider identifier");
        }
        public static Line debit(String code, BigDecimal amount, UUID chef) {
            return new Line(code, "INR", LedgerMoney.text(amount), "0.00", chef, null, null, null, null, null);
        }
        public static Line credit(String code, BigDecimal amount, UUID chef) {
            return new Line(code, "INR", "0.00", LedgerMoney.text(amount), chef, null, null, null, null, null);
        }
    }
    public record Entry(String businessEventKey, UUID sourceEventId, String source, String eventType,
                        UUID checkoutId, UUID chefOrderId, String currency, Instant occurredAt,
                        String evidenceReference, UUID reversalOf, String actorType, String actorId,
                        List<Line> lines) {
        public Entry {
            if (businessEventKey == null || !businessEventKey.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}"))
                throw new IllegalArgumentException("a canonical business event key is required");
            Objects.requireNonNull(sourceEventId, "source event ID is required");
            if (source == null || !source.matches("[A-Za-z0-9._-]{1,80}")) throw new IllegalArgumentException("source is required");
            if (eventType == null || !eventType.matches("[A-Z][A-Z0-9_]{1,79}")) throw new IllegalArgumentException("event type is required");
            LedgerMoney.currency(currency);
            Objects.requireNonNull(occurredAt, "economic event time is required");
            if (evidenceReference == null || evidenceReference.isBlank() || evidenceReference.length() > 500)
                throw new IllegalArgumentException("an evidence reference is required");
            if (!List.of("SERVICE", "HUMAN").contains(actorType) || actorId == null || actorId.isBlank() || actorId.length() > 120)
                throw new IllegalArgumentException("an authenticated actor is required");
            if (lines == null || lines.size() < 2 || lines.size() > 500)
                throw new IllegalArgumentException("a journal requires between 2 and 500 nonzero lines");
            lines = List.copyOf(lines);
            BigDecimal debit = BigDecimal.ZERO, credit = BigDecimal.ZERO;
            for (Line line : lines) {
                if (!currency.equals(line.currency())) throw new IllegalArgumentException("mixed currency journal");
                debit = debit.add(LedgerMoney.parse(line.debit())); credit = credit.add(LedgerMoney.parse(line.credit()));
            }
            if (debit.compareTo(credit) != 0) throw new IllegalArgumentException("journal does not balance");
        }
    }
}
