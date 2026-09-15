package in.craves.referral.domain;

import in.craves.referral.ReferralSettings;
import in.craves.referral.core.RewardMath;
import in.craves.referral.core.RewardPolicy;
import in.craves.referral.infra.Store;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.infra.Store.*;

@Service
public class AwardService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final ReversalService reversals;
    private final ReferralSettings settings;
    public AwardService(Store db,ProgramService program,OrderLocks locks,ReversalService reversals,ReferralSettings settings) {
        this.db=db; this.program=program; this.locks=locks; this.reversals=reversals; this.settings=settings;
    }
    public boolean award(UUID order) {
        if(!settings.enabled() || !settings.awardsEnabled()) return false;
        return db.tx(() -> {
            Map<String,Object> state=locks.lockOrder(order), snapshot=locks.snapshot(order);
            Map<String,Object> checkout=locks.checkout(uuid(snapshot,"checkout_id"));
            if(bool(state,"awarded")) return false;
            if(instant(state,"delivered_at")==null || !bool(state,"verified_capture")
                || number(state,"confirmed_refund_paise")!=number(state,"refunded_food_paise")) return false;
            RewardPolicy policy=program.policy(program.policyById(number(checkout,"policy_id")));
            long basis=number(snapshot,"food_paise"); List<UUID> ancestors=array(snapshot,"ancestor_ids");
            boolean[] eligible=new boolean[3];
            for(int i=0;i<ancestors.size();i++)
                eligible[i]=db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=? AND is_active",ancestors.get(i))==1;
            long[] original=RewardMath.allocate(basis,policy,eligible);
            long[] remaining=RewardMath.refundTargets(basis,number(state,"refunded_food_paise"),policy,eligible,original);
            boolean qualifying=basis>=policy.minimumPaise() && !bool(checkout,"full_refund") && number(state,"refunded_food_paise")<basis;
            if(qualifying && Arrays.stream(remaining).sum()>number(state,"commission_budget_paise")) {
                db.emit("funding-review:"+order,"referral.funding.review",Map.of("chefOrderId",order.toString())); return false;
            }
            if(qualifying) {
                db.lockWallets(ancestors);
                Instant hold=instant(state,"delivered_at").plusSeconds(policy.holdDays()*86400L);
                for(int i=0;i<ancestors.size();i++) if(original[i]>0)
                    create("upline:"+order+":"+(i+1),order,uuid(snapshot,"checkout_id"),ancestors.get(i),"UPLINE",i+1,
                        policy.rates().get(i),original[i],number(checkout,"policy_id"),hold);
                reversals.order(order,"initial-refund:"+order,"REFUND_KNOWN_BEFORE_AWARD");
            }
            db.update("UPDATE referral_schema.order_state SET awarded=true WHERE order_id=?",order);
            return true;
        });
    }
    public boolean awardCustomer(UUID checkoutId) {
        if(!settings.enabled() || !settings.awardsEnabled()) return false;
        return db.tx(() -> {
            Map<String,Object> checkout=locks.lockCheckout(checkoutId);
            if(!bool(checkout,"first_qualifying_confirmed") || bool(checkout,"full_refund")
                || db.count("SELECT count(*) FROM referral_schema.reward WHERE checkout_id=? AND track='CUSTOMER'",checkoutId)>0) return false;
            List<Map<String,Object>> orders=locks.states(checkoutId);
            if(orders.size()!=number(checkout,"chef_order_count") || orders.stream().mapToLong(row->number(row,"food_paise")).sum()!=number(checkout,"food_paise")) return false;
            if(orders.stream().anyMatch(row->instant(row,"delivered_at")==null || !bool(row,"verified_capture")
                || number(row,"confirmed_refund_paise")!=number(row,"refunded_food_paise"))) return false;
            UUID buyer=uuid(checkout,"buyer_id");
            UUID parent=uuid(db.one("SELECT parent_id FROM referral_schema.member WHERE user_id=?",buyer),"parent_id");
            if(parent==null || db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=? AND is_active",parent)==0) return false;
            RewardPolicy policy=program.policy(program.policyById(number(checkout,"policy_id")));
            if(number(checkout,"food_paise")<policy.minimumPaise() || policy.customerBonusPaise()==0) return false;
            long refunded=orders.stream().mapToLong(row->number(row,"refunded_food_paise")).sum();
            if(refunded>=number(checkout,"food_paise")) return false;
            db.lockWallets(List.of(parent));
            db.budget("customer-reserve:"+checkoutId,"CUSTOMER",-policy.customerBonusPaise(),"first-qualifying-checkout:"+checkoutId);
            Instant lastDelivery=orders.stream().map(row->instant(row,"delivered_at")).max(Instant::compareTo).orElseThrow();
            create("customer:"+buyer,null,checkoutId,parent,"CUSTOMER",0,0,policy.customerBonusPaise(),number(checkout,"policy_id"),
                lastDelivery.plusSeconds(policy.holdDays()*86400L));
            return true;
        });
    }
    private void create(String key,UUID order,UUID checkout,UUID owner,String track,int level,int rate,long amount,long policy,Instant hold) {
        UUID id=UUID.randomUUID();
        db.update("INSERT INTO referral_schema.reward(id,business_key,order_id,checkout_id,beneficiary_id,track,level,rate_bps,amount_paise,policy_id,hold_until) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            id,key,order,checkout,owner,track,level,rate,amount,policy,time(hold));
        db.journal("award:"+id,owner,amount,0,0,track.equals("UPLINE")?"UPLINE_EXPENSE":"MARKETING_EXPENSE",id,checkout);
        db.emit("pending:"+id,"referral.reward.pending",Map.of("rewardId",id.toString(),"beneficiaryUserId",owner.toString(),
            "amountPaise",Long.toString(amount),"holdUntil",hold.toString()));
    }
}
