package in.craves.referral.domain;

import in.craves.referral.infra.Store;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** One lock order everywhere: checkout, sorted chef orders, rewards, sorted wallets. */
@Component
public class OrderLocks {
    private final Store db;
    public OrderLocks(Store db) { this.db=db; }
    public Map<String,Object> snapshot(UUID order) {
        return db.one("SELECT * FROM referral_schema.order_snapshot WHERE order_id=?",order);
    }
    public Map<String,Object> checkout(UUID id) {
        return db.one("SELECT * FROM referral_schema.checkout WHERE checkout_id=?",id);
    }
    public Map<String,Object> lockCheckout(UUID id) {
        Map<String,Object> result=db.one("SELECT * FROM referral_schema.checkout WHERE checkout_id=? FOR UPDATE",id);
        db.rows("SELECT st.order_id FROM referral_schema.order_state st JOIN referral_schema.order_snapshot s ON s.order_id=st.order_id WHERE s.checkout_id=? ORDER BY st.order_id FOR UPDATE OF st",id);
        return result;
    }
    public Map<String,Object> lockOrder(UUID id) {
        lockCheckout(uuid(snapshot(id),"checkout_id"));
        return db.one("SELECT * FROM referral_schema.order_state WHERE order_id=?",id);
    }
    public List<Map<String,Object>> states(UUID checkout) {
        return db.rows("SELECT st.*,s.food_paise,s.seller_id FROM referral_schema.order_state st JOIN referral_schema.order_snapshot s ON st.order_id=s.order_id WHERE s.checkout_id=? ORDER BY st.order_id",checkout);
    }
    public boolean newVersion(Map<String,Object> state,String prefix,int version,String hash) {
        require(List.of("delivery","refund","finance").contains(prefix),422,"INVALID_SOURCE_TYPE");
        long old=number(state,prefix+"_version");
        if(version<old) return false;
        if(version==old) {
            require(hash.equals(state.get(prefix+"_hash")),409,"SOURCE_VERSION_CONFLICT");
            return false;
        }
        return true;
    }
}
