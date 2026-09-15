package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import in.craves.integration.ledger.LedgerJournal.Entry;
import in.craves.integration.ledger.LedgerJournal.Line;
import in.craves.integration.ledger.LedgerJournal.Outcome;
import in.craves.integration.ledger.LedgerJournal.Receipt;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Internal posting API only. Provider network calls must never run inside this transaction. */
@Service
public class LedgerPostingService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final boolean enabled;

    public LedgerPostingService(JdbcTemplate jdbc, ObjectMapper json,
                                @Value("${craves.ledger.posting-enabled:false}") boolean enabled) {
        this.jdbc=jdbc; this.json=json.copy().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS); this.enabled=enabled;
    }

    @Transactional
    public Receipt post(Entry entry) {
        if (!enabled) throw new IllegalStateException("Financial journal posting is disabled");
        String hash = economicHash(entry);
        lock("ledger-event/"+entry.sourceEventId());
        lock("ledger-business/"+entry.businessEventKey());
        var inbox = jdbc.query("SELECT business_event_key,payload_hash,transaction_id FROM payment_schema.ledger_event_inbox WHERE event_id=?",
            (rs,n)->new Existing(rs.getString(1),rs.getString(2),rs.getObject(3,UUID.class)),entry.sourceEventId());
        if (!inbox.isEmpty() && (!inbox.getFirst().key().equals(entry.businessEventKey()) || !inbox.getFirst().hash().equals(hash)))
            return conflict(entry,hash,inbox.getFirst(),"SOURCE_EVENT_CONTENT_CHANGED");
        var existing = jdbc.query("SELECT business_event_key,payload_hash,id FROM payment_schema.ledger_transaction WHERE business_event_key=?",
            (rs,n)->new Existing(rs.getString(1),rs.getString(2),rs.getObject(3,UUID.class)),entry.businessEventKey());
        if (!existing.isEmpty()) {
            Existing previous=existing.getFirst();
            if (!previous.hash().equals(hash)) return conflict(entry,hash,previous,"BUSINESS_EVENT_CONTENT_CHANGED");
            receive(entry,hash,previous.id());
            return new Receipt(previous.id(),Outcome.REPLAY,entry.businessEventKey());
        }
        if (entry.reversalOf()!=null) validateFullReversal(entry);
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO payment_schema.ledger_transaction
            (id,business_event_key,source_event_id,source,event_type,checkout_id,chef_order_id,currency,
             occurred_at,business_date,evidence_reference,payload_hash,reversal_of,actor_type,actor_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,id,entry.businessEventKey(),entry.sourceEventId(),entry.source(),entry.eventType(),entry.checkoutId(),
            entry.chefOrderId(),entry.currency(),Timestamp.from(entry.occurredAt()),
            java.sql.Date.valueOf(entry.occurredAt().atZone(ZoneId.of("Asia/Kolkata")).toLocalDate()),
            entry.evidenceReference(),hash,entry.reversalOf(),entry.actorType(),entry.actorId());
        int sequence=0;
        for (Line line:entry.lines()) {
            jdbc.update("""
                INSERT INTO payment_schema.ledger_line
                (id,transaction_id,sequence,account_code,currency,debit_amount,credit_amount,chef_identity_id,
                 delivery_attempt_id,provider_id,payment_id,refund_id,payout_instruction_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,UUID.randomUUID(),id,++sequence,line.accountCode(),line.currency(),LedgerMoney.parse(line.debit()),
                LedgerMoney.parse(line.credit()),line.chefIdentityId(),line.deliveryAttemptId(),line.providerId(),
                line.paymentId(),line.refundId(),line.payoutInstructionId());
        }
        receive(entry,hash,id);
        jdbc.update("INSERT INTO payment_schema.ledger_outbox(id,transaction_id,event_type,payload) VALUES (?,?,?,CAST(? AS jsonb))",
            UUID.randomUUID(),id,"FINANCIAL_JOURNAL_POSTED",encode(Map.of("transactionId",id.toString(),
                "businessEventKey",entry.businessEventKey(),"currency",entry.currency(),"schemaVersion","1.0")));
        return new Receipt(id,Outcome.POSTED,entry.businessEventKey());
    }

    private void receive(Entry entry,String hash,UUID transactionId) {
        jdbc.update("INSERT INTO payment_schema.ledger_event_inbox(event_id,source,business_event_key,payload_hash,transaction_id) VALUES (?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING",
            entry.sourceEventId(),entry.source(),entry.businessEventKey(),hash,transactionId);
    }
    private Receipt conflict(Entry entry,String hash,Existing previous,String reason) {
        jdbc.update("INSERT INTO payment_schema.ledger_conflict(id,source_event_id,business_event_key,existing_transaction_id,existing_hash,attempted_hash,reason) VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_event_id,attempted_hash) DO NOTHING",
            UUID.randomUUID(),entry.sourceEventId(),entry.businessEventKey(),previous.id(),previous.hash(),hash,reason);
        // Return (do not throw) so the caller can commit the exception evidence without posting money.
        return new Receipt(previous.id(),Outcome.CONFLICT,entry.businessEventKey());
    }
    private void lock(String resource) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs -> { return null; },resource);
    }
    private void validateFullReversal(Entry entry) {
        var original=jdbc.query("SELECT checkout_id,chef_order_id,currency FROM payment_schema.ledger_transaction WHERE id=?",
            (rs,n)->List.of(String.valueOf(rs.getObject(1)),String.valueOf(rs.getObject(2)),rs.getString(3)),entry.reversalOf());
        if (original.isEmpty() || !original.getFirst().equals(List.of(String.valueOf(entry.checkoutId()),String.valueOf(entry.chefOrderId()),entry.currency())))
            throw new IllegalArgumentException("reversal must reference an original journal with matching order and currency");
        List<Line> inverse=jdbc.query("SELECT * FROM payment_schema.ledger_line WHERE transaction_id=? ORDER BY sequence",
            (rs,n)->new Line(rs.getString("account_code"),rs.getString("currency"),
                LedgerMoney.text(rs.getBigDecimal("credit_amount")),LedgerMoney.text(rs.getBigDecimal("debit_amount")),
                rs.getObject("chef_identity_id",UUID.class),rs.getObject("delivery_attempt_id",UUID.class),rs.getString("provider_id"),
                rs.getObject("payment_id",UUID.class),rs.getObject("refund_id",UUID.class),rs.getObject("payout_instruction_id",UUID.class)),entry.reversalOf());
        if (!inverse.equals(entry.lines())) throw new IllegalArgumentException("full reversal must exactly invert every original line and dimension");
    }
    public String economicHash(Entry entry) {
        Map<String,Object> content=new LinkedHashMap<>();
        content.put("businessEventKey",entry.businessEventKey()); content.put("source",entry.source());
        content.put("eventType",entry.eventType()); content.put("checkoutId",entry.checkoutId());
        content.put("chefOrderId",entry.chefOrderId()); content.put("currency",entry.currency());
        content.put("occurredAt",entry.occurredAt().toString()); content.put("evidenceReference",entry.evidenceReference());
        content.put("reversalOf",entry.reversalOf()); content.put("lines",entry.lines());
        // A new transport event ID or retrying actor does not change the economic event.
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(encode(content).getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw new IllegalArgumentException("financial context cannot be serialized",exception); }
    }
    private record Existing(String key,String hash,UUID id) {}
}
