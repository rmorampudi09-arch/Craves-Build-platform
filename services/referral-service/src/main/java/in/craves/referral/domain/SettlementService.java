package in.craves.referral.domain;

import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.infra.Store.*;

@Service
public class SettlementService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final ReversalService reversals;
    private final ReferralSettings settings;
    private final Clock clock;
    public SettlementService(Store db,ProgramService program,OrderLocks locks,ReversalService reversals,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.locks=locks; this.reversals=reversals; this.settings=settings; this.clock=clock;
    }
    public boolean settle(UUID rewardId) {
        if(!settings.enabled() || !settings.settlementEnabled()) return false;
        return db.tx(() -> {
            List<Map<String,Object>> matches=db.rows("SELECT checkout_id FROM referral_schema.reward WHERE id=?",rewardId);
            if(matches.isEmpty()) return false;
            UUID checkoutId=uuid(matches.getFirst(),"checkout_id"); Map<String,Object> checkout=locks.lockCheckout(checkoutId);
            Map<String,Object> reward=db.one("SELECT * FROM referral_schema.reward WHERE id=? FOR UPDATE",rewardId);
            if(!reward.get("status").equals("PENDING") || instant(reward,"hold_until").isAfter(clock.instant())) return false;
            if(bool(checkout,"full_refund")) {
                reversals.reverse(reward,reversals.outstanding(reward),"settlement-full-refund:"+rewardId,"FULL_REFUND",null); return false;
            }
            List<Map<String,Object>> orders=locks.states(checkoutId);
            if(orders.size()!=number(checkout,"chef_order_count")) return false;
            UUID orderId=uuid(reward,"order_id");
            List<Map<String,Object>> relevant=orderId==null?orders:orders.stream().filter(row->uuid(row,"order_id").equals(orderId)).toList();
            Instant now=clock.instant(); long freshness=settings.reconciliationFreshnessSeconds();
            if(freshness<1 || freshness>3600) return false;
            if(relevant.isEmpty() || relevant.stream().anyMatch(row->!bool(row,"verified_capture") || instant(row,"delivered_at")==null
                || number(row,"confirmed_refund_paise")!=number(row,"refunded_food_paise")
                || instant(row,"finance_observed_at")==null || instant(row,"finance_observed_at").isBefore(instant(reward,"hold_until"))
                || instant(row,"finance_observed_at").isBefore(now.minusSeconds(freshness)))) {
                db.emit("refresh:"+rewardId+":"+(now.getEpochSecond()/900),"referral.finance.refresh.requested",
                    Map.of("checkoutId",checkoutId.toString(),"rewardId",rewardId.toString())); return false;
            }
            for(Map<String,Object> order:relevant) {
                long exposure=db.count("SELECT COALESCE(sum(r.amount_paise-COALESCE((SELECT sum(v.amount_paise) FROM referral_schema.reversal v WHERE v.reward_id=r.id),0)),0) FROM referral_schema.reward r WHERE r.order_id=? AND r.track='UPLINE'",uuid(order,"order_id"));
                if(exposure>number(order,"commission_budget_paise")) return false;
            }
            if(db.count("SELECT count(*) FROM referral_schema.inbox WHERE status<>'APPLIED' AND (aggregate_id=? OR aggregate_id IN (SELECT order_id FROM referral_schema.order_snapshot WHERE checkout_id=?))",checkoutId,checkoutId)>0) return false;
            UUID user=uuid(reward,"beneficiary_id"); db.lockWallets(List.of(user));
            if(program.held(user) || settings.lifetimeReviewPaise()<=0) return false;
            long amount=reversals.outstanding(reward); if(amount<=0) return false;
            long lifetime=db.count("SELECT COALESCE(sum(pending_delta+available_delta+reserved_delta),0) FROM referral_schema.journal WHERE user_id=? AND counterparty IN ('UPLINE_EXPENSE','MARKETING_EXPENSE')",user);
            if(lifetime>settings.lifetimeReviewPaise()
                && program.fraud(user,"lifetime:"+user,"LIFETIME_EARNINGS_REVIEW","threshold-crossed")) return false;
            UUID referred=orderId==null?uuid(checkout,"buyer_id"):uuid(locks.snapshot(orderId),"seller_id");
            if(db.count("SELECT count(*) FROM referral_schema.credited_referral WHERE beneficiary_id=? AND referred_user_id=?",user,referred)==0) {
                Instant week=now.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate()
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();
                long credited=db.count("SELECT count(*) FROM referral_schema.credited_referral WHERE beneficiary_id=? AND first_credited_at>=?",user,time(week));
                if(credited>=20 && program.fraud(user,"velocity:"+user+":"+week.getEpochSecond(),"WEEKLY_REFERRAL_VELOCITY","more-than-20-new-credited-referrals")) return false;
                db.update("INSERT INTO referral_schema.credited_referral(beneficiary_id,referred_user_id,first_credited_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",user,referred,time(now));
            }
            db.journal("credit:"+rewardId,user,-amount,amount,0,"INTERNAL_TRANSFER",rewardId,checkoutId);
            db.update("UPDATE referral_schema.reward SET status='CREDITED',settled_at=? WHERE id=?",time(now),rewardId);
            db.emit("credited:"+rewardId,"referral.reward.credited",Map.of("rewardId",rewardId.toString(),"beneficiaryUserId",user.toString(),"amountPaise",Long.toString(amount)));
            return true;
        });
    }
}
