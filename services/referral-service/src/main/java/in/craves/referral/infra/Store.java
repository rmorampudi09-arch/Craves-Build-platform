package in.craves.referral.infra;

import in.craves.referral.ReferralProblem;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class Store {
    public final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public Store(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.transaction = new TransactionTemplate(manager); this.transaction.setTimeout(15);
    }
    public <T> T tx(Supplier<T> work) { return transaction.execute(status -> work.get()); }
    public int update(String sql, Object... parameters) { return jdbc.update(sql, parameters); }
    public List<Map<String,Object>> rows(String sql, Object... parameters) { return jdbc.queryForList(sql, parameters); }
    public Map<String,Object> one(String sql, Object... parameters) {
        List<Map<String,Object>> rows = rows(sql, parameters);
        ReferralProblem.require(rows.size() == 1, 409, "SOURCE_DEPENDENCY_MISSING");
        return rows.getFirst();
    }
    public long count(String sql, Object... parameters) { Long value=jdbc.queryForObject(sql,Long.class,parameters); return value==null?0:value; }
    public void lockWallets(List<UUID> users) {
        users.stream().distinct().sorted(Comparator.comparing(UUID::toString))
            .forEach(id -> one("SELECT user_id FROM referral_schema.wallet WHERE user_id=? FOR UPDATE",id));
    }
    public void journal(String key, UUID user, long pending, long available, long reserved, String counterparty, UUID reward, UUID reference) {
        long counterpart = Math.negateExact(Math.addExact(Math.addExact(pending,available),reserved));
        int changed=update("INSERT INTO referral_schema.journal(event_key,user_id,pending_delta,available_delta,reserved_delta,counterparty_delta,counterparty,reward_id,reference_id) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
            key,user,pending,available,reserved,counterpart,counterparty,reward,reference);
        if(changed==0) {
            Map<String,Object> old=one("SELECT * FROM referral_schema.journal WHERE event_key=?",key);
            ReferralProblem.require(uuid(old,"user_id").equals(user) && number(old,"pending_delta")==pending
                && number(old,"available_delta")==available && number(old,"reserved_delta")==reserved
                && String.valueOf(old.get("counterparty")).equals(counterparty),409,"JOURNAL_KEY_CONFLICT");
        }
    }
    public void audit(String actor, String action, String target, Object detail) {
        update("INSERT INTO referral_schema.audit(actor,action,target,detail) VALUES (?,?,?,?::jsonb)",actor,action,target,Json.write(detail));
    }
    public void budget(String key,String track,long amount,String evidence) {
        one("SELECT track FROM referral_schema.budget WHERE track=? FOR UPDATE",track);
        if(amount<0) ReferralProblem.require(count("SELECT available_paise FROM referral_schema.budget WHERE track=?",track)>=-amount,409,"MARKETING_BUDGET_INSUFFICIENT");
        int changed=update("INSERT INTO referral_schema.budget_journal(event_key,track,amount_paise,evidence_ref) VALUES (?,?,?,?) ON CONFLICT(event_key) DO NOTHING",key,track,amount,evidence);
        if(changed==0) {
            Map<String,Object> old=one("SELECT * FROM referral_schema.budget_journal WHERE event_key=?",key);
            ReferralProblem.require(number(old,"amount_paise")==amount && old.get("track").equals(track),409,"BUDGET_KEY_CONFLICT");
        }
    }
    public void emit(String key,String type,Object payload) {
        update("INSERT INTO referral_schema.outbox(id,event_key,event_type,payload) VALUES (?,?,?,?::jsonb) ON CONFLICT(event_key) DO NOTHING",UUID.randomUUID(),key,type,Json.write(payload));
    }
    public static UUID uuid(Map<String,Object> row,String key) { return row.get(key)==null?null:UUID.fromString(row.get(key).toString()); }
    public static long number(Map<String,Object> row,String key) { return ((Number)row.get(key)).longValue(); }
    public static boolean bool(Map<String,Object> row,String key) { return Boolean.TRUE.equals(row.get(key)); }
    public static Instant instant(Map<String,Object> row,String key) { return row.get(key)==null?null:((Timestamp)row.get(key)).toInstant(); }
    public static Timestamp time(Instant value) { return value==null?null:Timestamp.from(value); }
    public static List<UUID> array(Map<String,Object> row,String key) {
        try {
            Object[] values=(Object[])((java.sql.Array)row.get(key)).getArray(); List<UUID> result=new ArrayList<>();
            for(Object value:values) result.add(UUID.fromString(value.toString())); return result;
        } catch(Exception ex) { throw new IllegalStateException("Invalid stored referral path",ex); }
    }
}
