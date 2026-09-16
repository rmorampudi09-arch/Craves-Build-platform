package in.craves.referral.domain;

import in.craves.referral.core.ChefReferralPolicy;
import in.craves.referral.core.RewardMath;
import in.craves.referral.infra.Store;
import java.sql.Date;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.infra.Store.*;

/** Chef rewards use their own append-only postings, never the legacy customer wallet. */
@Service
public class ChefEarningsService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final Clock clock;
    public ChefEarningsService(Store db,ProgramService program,OrderLocks locks,Clock clock) {
        this.db=db; this.program=program; this.locks=locks; this.clock=clock;
    }
    public boolean process(UUID order) {
        return process(order,true);
    }
    public boolean process(UUID order,boolean newCreditsAllowed) {
        return db.tx(()->processLocked(order,newCreditsAllowed));
    }
    private boolean processLocked(UUID order,boolean newCreditsAllowed) {
        Map<String,Object> state=locks.lockOrder(order), snapshot=locks.snapshot(order);
        Map<String,Object> checkout=locks.checkout(uuid(snapshot,"checkout_id"));
        Map<String,Object> policy=program.policyById(number(checkout,"policy_id"));
        if(!ChefReferralPolicy.VERSION.equals(policy.get("program_kind"))) return false;
        Instant now=clock.instant();
        var rewards=db.rows("SELECT * FROM referral_schema.chef_reward WHERE order_id=? ORDER BY level FOR UPDATE",order);
        long food=number(snapshot,"food_paise"), refund=number(state,"refunded_food_paise");
        List<UUID> ancestors=array(snapshot,"ancestor_ids");
        List<UUID> members=new ArrayList<>(ancestors); members.add(uuid(snapshot,"seller_id"));
        members.stream().distinct().sorted(Comparator.comparing(UUID::toString)).forEach(user->
            db.one("SELECT user_id FROM referral_schema.member WHERE user_id=? FOR UPDATE",user));

        // Refunds must be applied even when the beneficiary has since lost eligibility.
        boolean[] hadReward=new boolean[3]; long[] original=new long[3];
        for(var reward:rewards) {int i=(int)number(reward,"level")-1; hadReward[i]=true; original[i]=number(reward,"amount_paise");}
        long[] targets=RewardMath.refundTargets(food,refund,program.policy(policy),hadReward,original);
        if(bool(checkout,"full_refund")) targets=new long[3];
        boolean changed=false;
        for(var reward:rewards) changed=reverseExcess(reward,targets[(int)number(reward,"level")-1],now) || changed;
        if(!newCreditsAllowed) return changed;

        if(!ChefReferralPolicy.qualifies(food) || bool(checkout,"full_refund") || refund>=food) return changed;
        if(!bool(state,"verified_capture") || instant(state,"verified_paid_at")==null || instant(state,"delivered_at")==null
            || number(state,"confirmed_refund_paise")!=refund || instant(state,"finance_observed_at")==null
            || instant(state,"finance_observed_at").isBefore(now.minusSeconds(900))) {
            db.emit("chef-refresh:"+order+":"+(now.getEpochSecond()/300),"referral.finance.refresh.requested",
                Map.of("checkoutId",uuid(snapshot,"checkout_id").toString()));
            return changed;
        }
        if(db.count("SELECT count(*) FROM referral_schema.inbox WHERE status<>'APPLIED' AND (aggregate_id=? OR aggregate_id=?)",order,uuid(snapshot,"checkout_id"))>0) return changed;
        // An accepted but not yet applied account/chef event is known uncertainty, even
        // while the previous observation is still fresh. Refund debits above remain allowed.
        for(UUID member:members) if(db.count("SELECT count(*) FROM referral_schema.inbox WHERE source='auth' AND aggregate_id=? AND status<>'APPLIED'",member)>0) return changed;
        // Missing/stale authority is a retry, not an invented negative eligibility decision.
        for(UUID member:members) if(db.count("SELECT count(*) FROM referral_schema.chef_membership WHERE user_id=? AND observed_at>=?",member,time(now.minusSeconds(900)))!=1) return changed;
        if(!eligible(uuid(snapshot,"seller_id"))) return changed;
        boolean[] eligible=new boolean[3];
        for(int i=0;i<ancestors.size();i++) eligible[i]=eligible(ancestors.get(i));
        if(rewards.isEmpty()) {
            long[] amounts=ChefReferralPolicy.allocate(food,true,eligible);
            long[] net=RewardMath.refundTargets(food,refund,program.policy(policy),eligible,amounts);
            if(!ChefReferralPolicy.commissionCovers(number(state,"commission_budget_paise"),net)) return changed;
            Instant due=ChefReferralPolicy.firstPostingRun(instant(state,"verified_paid_at"),instant(state,"delivered_at"));
            for(int i=0;i<ancestors.size();i++) if(amounts[i]>0) {
                db.update("INSERT INTO referral_schema.chef_reward(id,order_id,beneficiary_id,level,amount_paise,eligible_at,policy_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(),order,ancestors.get(i),i+1,amounts[i],time(due),number(checkout,"policy_id"),time(now));
                changed=true;
            }
            rewards=db.rows("SELECT * FROM referral_schema.chef_reward WHERE order_id=? ORDER BY level FOR UPDATE",order);
            targets=net;
        }
        // The budget covers all remaining rewards, including those not yet credited.
        if(!ChefReferralPolicy.commissionCovers(number(state,"commission_budget_paise"),targets)) return changed;
        for(var reward:rewards) {
            UUID id=uuid(reward,"id"), owner=uuid(reward,"beneficiary_id");
            long target=targets[(int)number(reward,"level")-1];
            if(target<=0 || !eligible(owner) || instant(reward,"eligible_at").isAfter(ChefReferralPolicy.latestPostingRun(now))
                || db.count("SELECT count(*) FROM referral_schema.chef_posting WHERE reward_id=? AND amount_paise>0",id)>0
                || db.count("SELECT count(*) FROM referral_schema.chef_reward_review WHERE reward_id=?",id)>0) continue;
            Date month=Date.valueOf(ChefReferralPolicy.postingMonth(now).atDay(1));
            db.update("INSERT INTO referral_schema.chef_month(beneficiary_id,month) VALUES (?,?) ON CONFLICT DO NOTHING",owner,month);
            var balance=db.one("SELECT * FROM referral_schema.chef_month WHERE beneficiary_id=? AND month=? FOR UPDATE",owner,month);
            long allowance=ChefReferralPolicy.remainingAllowance(number(balance,"posted_paise"),number(balance,"reversed_paise"));
            if(target>allowance) {
                // No approved expiry/carry-forward rule exists. Preserve the claim without inventing one.
                db.update("INSERT INTO referral_schema.chef_reward_review(reward_id,reason,first_observed_at) VALUES (?,'MONTHLY_CAP_POLICY_REQUIRED',?) ON CONFLICT DO NOTHING",id,time(now));
                continue;
            }
            db.update("INSERT INTO referral_schema.chef_posting(id,event_key,reward_id,beneficiary_id,month,amount_paise,posted_at) VALUES (?,?,?,?,?,?,?)",
                UUID.randomUUID(),"chef-credit:"+id,id,owner,month,target,time(now));
            changed=true;
        }
        return changed;
    }
    private boolean eligible(UUID user) {
        return !program.held(user) && db.count("SELECT count(*) FROM referral_schema.chef_membership WHERE user_id=? AND eligible",user)==1;
    }
    private boolean reverseExcess(Map<String,Object> reward,long target,Instant now) {
        UUID id=uuid(reward,"id");
        var credits=db.rows("SELECT * FROM referral_schema.chef_posting WHERE reward_id=? AND amount_paise>0",id);
        if(credits.isEmpty()) return false;
        var credit=credits.getFirst();
        long outstanding=db.count("SELECT coalesce(sum(amount_paise),0) FROM referral_schema.chef_posting WHERE reward_id=?",id);
        if(outstanding<=target) return false;
        db.update("INSERT INTO referral_schema.chef_posting(id,event_key,reward_id,beneficiary_id,month,amount_paise,original_id,posted_at) VALUES (?,?,?,?,?,?,?,?)",
            UUID.randomUUID(),"chef-reverse:"+id+":"+target,id,uuid(reward,"beneficiary_id"),credit.get("month"),target-outstanding,uuid(credit,"id"),time(now));
        return true;
    }
}
