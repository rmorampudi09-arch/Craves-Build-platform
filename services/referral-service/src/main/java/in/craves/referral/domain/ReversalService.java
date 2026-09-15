package in.craves.referral.domain;

import in.craves.referral.ReferralSettings;
import in.craves.referral.core.RewardMath;
import in.craves.referral.core.RewardPolicy;
import in.craves.referral.infra.Store;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Refunds append compensating entries. Partial refunds leave the remaining award settleable. */
@Service
public class ReversalService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final ReferralSettings settings;
    public ReversalService(Store db,ProgramService program,OrderLocks locks,ReferralSettings settings) {
        this.db=db; this.program=program; this.locks=locks; this.settings=settings;
    }
    public long outstanding(Map<String,Object> reward) {
        return number(reward,"amount_paise")-db.count("SELECT COALESCE(sum(amount_paise),0) FROM referral_schema.reversal WHERE reward_id=?",uuid(reward,"id"));
    }
    public void order(UUID order,String reasonKey,String reason) {
        Map<String,Object> snapshot=locks.snapshot(order);
        Map<String,Object> state=db.one("SELECT * FROM referral_schema.order_state WHERE order_id=?",order);
        List<Map<String,Object>> rewards=db.rows("SELECT * FROM referral_schema.reward WHERE order_id=? AND track='UPLINE' ORDER BY level FOR UPDATE",order);
        if(rewards.isEmpty()) return;
        RewardPolicy policy=program.policy(program.policyById(number(rewards.getFirst(),"policy_id")));
        long[] old=new long[3]; boolean[] eligible=new boolean[3];
        for(Map<String,Object> reward:rewards) {
            int i=(int)number(reward,"level")-1; old[i]=outstanding(reward); eligible[i]=true;
        }
        long[] target=RewardMath.refundTargets(number(snapshot,"food_paise"),number(state,"refunded_food_paise"),policy,eligible,old);
        db.lockWallets(rewards.stream().map(row->uuid(row,"beneficiary_id")).toList());
        for(Map<String,Object> reward:rewards) {
            int i=(int)number(reward,"level")-1;
            reverse(reward,old[i]-target[i],reasonKey+":"+(i+1),reason,null);
        }
    }
    public void fullCheckout(UUID checkout,String reasonKey,String reason) {
        List<Map<String,Object>> rewards=db.rows("SELECT * FROM referral_schema.reward WHERE checkout_id=? ORDER BY id FOR UPDATE",checkout);
        db.lockWallets(rewards.stream().map(row->uuid(row,"beneficiary_id")).toList());
        for(Map<String,Object> reward:rewards)
            reverse(reward,outstanding(reward),reasonKey+":"+uuid(reward,"id"),reason,null);
    }
    public void manual(UUID actor,UUID rewardId,long amount,String reason,UUID operationId) {
        settings.requireEnabled();
        require(reason!=null && !reason.isBlank() && reason.length()<=80,422,"REVERSAL_REASON_REQUIRED");
        require(amount>0,422,"POSITIVE_REVERSAL_REQUIRED");
        db.tx(() -> {
            Map<String,Object> match=db.one("SELECT checkout_id FROM referral_schema.reward WHERE id=?",rewardId);
            locks.lockCheckout(uuid(match,"checkout_id"));
            Map<String,Object> reward=db.one("SELECT * FROM referral_schema.reward WHERE id=? FOR UPDATE",rewardId);
            require(!actor.equals(uuid(reward,"beneficiary_id")),403,"SELF_REVERSAL_FORBIDDEN");
            String key="manual:"+operationId;
            List<Map<String,Object>> prior=db.rows("SELECT reward_id,amount_paise,actor_id,reason_code FROM referral_schema.reversal WHERE reason_key=?",key);
            if(!prior.isEmpty()) {
                Map<String,Object> row=prior.getFirst();
                require(uuid(row,"reward_id").equals(rewardId) && number(row,"amount_paise")==amount
                    && actor.equals(uuid(row,"actor_id")) && row.get("reason_code").equals(reason),409,"REVERSAL_KEY_CONFLICT"); return null;
            }
            reverse(reward,amount,key,reason,actor);
            db.audit(actor.toString(),"MANUAL_REWARD_REVERSAL",rewardId.toString(),Map.of("amountPaise",Long.toString(amount),"reason",reason,"operationId",operationId.toString()));
            return null;
        });
    }
    public void reverse(Map<String,Object> reward,long amount,String reasonKey,String reason,UUID actor) {
        if(amount==0) return;
        long outstanding=outstanding(reward);
        require(amount>0 && amount<=outstanding,409,"REVERSAL_EXCEEDS_REWARD");
        UUID id=uuid(reward,"id"), user=uuid(reward,"beneficiary_id");
        db.lockWallets(List.of(user));
        boolean pending=reward.get("status").equals("PENDING");
        require(pending || reward.get("status").equals("CREDITED"),409,"REWARD_ALREADY_REVERSED");
        db.update("INSERT INTO referral_schema.reversal(id,reward_id,reason_key,amount_paise,reason_code,actor_id) VALUES (?,?,?,?,?,?)",
            UUID.randomUUID(),id,reasonKey,amount,reason.length()>80?"SOURCE_REFUND":reason,actor);
        boolean customer=reward.get("track").equals("CUSTOMER");
        db.journal("reversal:"+reasonKey,user,pending?-amount:0,pending?0:-amount,0,customer?"MARKETING_EXPENSE":"UPLINE_EXPENSE",id,uuid(reward,"checkout_id"));
        if(customer) db.budget("refund-budget:"+reasonKey,"CUSTOMER",amount,"reward-reversal:"+id);
        if(amount==outstanding)
            db.update("UPDATE referral_schema.reward SET status=? WHERE id=?",pending?"CANCELLED":"REVERSED",id);
        db.emit("reversed:"+reasonKey,"referral.reward.reversed",Map.of("rewardId",id.toString(),"beneficiaryUserId",user.toString(),"amountPaise",Long.toString(amount)));
    }
}
