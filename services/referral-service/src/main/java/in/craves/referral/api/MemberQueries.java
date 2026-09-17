package in.craves.referral.api;

import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import in.craves.referral.domain.CashoutService;
import in.craves.referral.domain.ProgramService;
import in.craves.referral.domain.RecipientService;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

@Service
public class MemberQueries {
    private final Store db;
    private final ProgramService program;
    private final RecipientService recipients;
    private final ReferralSettings settings;
    private final Clock clock;
    public MemberQueries(Store db,ProgramService program,RecipientService recipients,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.recipients=recipients; this.settings=settings; this.clock=clock;
    }
    public void requireMember(UUID user) {
        settings.requireEnabled();
        require(db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=? AND is_active",user)==1,403,"REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE");
    }
    public Map<String,Object> overview(UUID user) {
        requireMember(user);
        Map<String,Object> wallet=db.one("SELECT * FROM referral_schema.wallet WHERE user_id=?",user);
        boolean held=program.held(user); String reason="CASHOUT_DISABLED"; boolean eligible=false;
        if(settings.withdrawalsEnabled()) {
            try {
                require(!held,409,"RECIPIENT_ON_HOLD"); recipients.eligible(user,settings.cashoutMinimumPaise());
                require(number(wallet,"available_paise")>=settings.cashoutMinimumPaise(),409,"BELOW_CASHOUT_MINIMUM");
                eligible=true; reason="ELIGIBLE";
            } catch(ReferralProblem ex) { reason=ex.getMessage(); }
        }
        List<Map<String,Object>> levels=new ArrayList<>();
        for(int level=1;level<=3;level++) {
            long earned=db.count("SELECT COALESCE(sum(r.amount_paise-COALESCE((SELECT sum(v.amount_paise) FROM referral_schema.reversal v WHERE v.reward_id=r.id),0)),0) FROM referral_schema.reward r WHERE r.beneficiary_id=? AND r.track='UPLINE' AND r.level=?",user,level);
            levels.add(Map.of("level",level,"netEarnedPaise",Long.toString(earned)));
        }
        List<Map<String,Object>> network=db.rows("WITH RECURSIVE chain AS (SELECT user_id,1 AS level FROM referral_schema.member WHERE parent_id=? UNION ALL SELECT m.user_id,c.level+1 FROM referral_schema.member m JOIN chain c ON m.parent_id=c.user_id WHERE c.level<3) SELECT level,count(*) AS members FROM chain GROUP BY level ORDER BY level",user);
        List<Map<String,Object>> downline=new ArrayList<>();
        for(Map<String,Object> row:network) downline.add(Map.of("level",number(row,"level"),"members",Long.toString(number(row,"members"))));
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("asOf",clock.instant().toString()); result.put("currency","INR");
        result.put("pendingPaise",Long.toString(number(wallet,"pending_paise")));
        result.put("availablePaise",Long.toString(number(wallet,"available_paise")));
        result.put("reservedPaise",Long.toString(number(wallet,"reserved_paise")));
        result.put("balanceUpdatedAt",instant(wallet,"updated_at").toString());
        result.put("onReviewHold",held); result.put("levels",levels); result.put("downline",downline);
        result.put("code",program.code(user));
        result.put("cashout",Map.of("enabled",settings.withdrawalsEnabled(),"eligible",eligible,"reason",reason,
            "minimumPaise",Long.toString(settings.cashoutMinimumPaise())));
        result.put("spendingEnabled",settings.spendingEnabled() && !held);
        List<Map<String,Object>> policies=db.rows("SELECT p.* FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id WHERE a.effective_at<=? ORDER BY a.effective_at DESC LIMIT 1",time(clock.instant()));
        result.put("policy",policies.isEmpty()?null:policyValue(policies.getFirst()));
        return result;
    }
    /** Recorded referral credits are not represented as immediately withdrawable money. */
    public Map<String,Object> chefEarnings(UUID user) {
        requireMember(user);
        long posted=db.count("SELECT coalesce(sum(amount_paise),0) FROM referral_schema.chef_posting WHERE beneficiary_id=? AND amount_paise>0",user);
        long reversed=-db.count("SELECT coalesce(sum(amount_paise),0) FROM referral_schema.chef_posting WHERE beneficiary_id=? AND amount_paise<0",user);
        var month=in.craves.referral.core.ChefReferralPolicy.postingMonth(clock.instant());
        long used=db.count("SELECT coalesce(sum(posted_paise-reversed_paise),0) FROM referral_schema.chef_month WHERE beneficiary_id=? AND month=?",user,java.sql.Date.valueOf(month.atDay(1)));
        var result=new LinkedHashMap<String,Object>();
        result.put("currency","INR");result.put("asOf",clock.instant().toString());
        result.put("creditedPaise",Long.toString(posted));result.put("reversedPaise",Long.toString(reversed));
        result.put("netRecordedPaise",Long.toString(posted-reversed));result.put("postingMonth",month.toString());
        result.put("monthlyCapPaise","150000");result.put("monthUsedPaise",Long.toString(used));
        result.put("monthRemainingPaise",Long.toString(in.craves.referral.core.ChefReferralPolicy.remainingAllowance(used,0)));
        result.put("monthlyCapReached",used>=in.craves.referral.core.ChefReferralPolicy.MONTHLY_CAP_PAISE);
        result.put("settlementDestination","CHEF_EARNINGS");
        result.put("withdrawalAvailability","CHECK_VERIFIED_CHEF_EARNINGS_BALANCE");
        result.put("recentPostings",db.rows("SELECT id,amount_paise,month,posted_at FROM referral_schema.chef_posting WHERE beneficiary_id=? ORDER BY posted_at DESC,id DESC LIMIT 50",user).stream().map(row->
            Map.of("id",uuid(row,"id").toString(),"amountPaise",Long.toString(number(row,"amount_paise")),"postingMonth",row.get("month").toString(),"postedAt",instant(row,"posted_at").toString())).toList());
        return result;
    }
    public Map<String,Object> rewards(UUID user,int limit,String cursor) {
        requireMember(user); require(limit>=1 && limit<=100,422,"INVALID_PAGE_SIZE"); PageCursor page=PageCursor.parse(cursor);
        List<Map<String,Object>> rows;
        String projection="SELECT r.*,COALESCE((SELECT sum(v.amount_paise) FROM referral_schema.reversal v WHERE v.reward_id=r.id),0) AS reversed_paise FROM referral_schema.reward r WHERE r.beneficiary_id=?";
        if(page==null) rows=db.rows(projection+" ORDER BY r.created_at DESC,r.id DESC LIMIT ?",user,limit+1);
        else rows=db.rows(projection+" AND (r.created_at,r.id)<(?,?) ORDER BY r.created_at DESC,r.id DESC LIMIT ?",user,time(page.at()),page.id(),limit+1);
        boolean more=rows.size()>limit; List<Map<String,Object>> visible=rows.subList(0,Math.min(limit,rows.size()));
        List<Map<String,Object>> items=new ArrayList<>();
        for(Map<String,Object> row:visible) items.add(Map.of("id",uuid(row,"id").toString(),"track",row.get("track"),"level",number(row,"level"),
            "amountPaise",Long.toString(number(row,"amount_paise")),"reversedPaise",Long.toString(number(row,"reversed_paise")),
            "netPaise",Long.toString(number(row,"amount_paise")-number(row,"reversed_paise")),"status",row.get("status"),
            "createdAt",instant(row,"created_at").toString(),"holdUntil",instant(row,"hold_until").toString()));
        Map<String,Object> result=new LinkedHashMap<>(); result.put("items",items);
        result.put("nextCursor",more?new PageCursor(instant(visible.getLast(),"created_at"),uuid(visible.getLast(),"id")).encode():null);
        return result;
    }
    public Map<String,Object> cashouts(UUID user,int limit,String cursor) {
        requireMember(user); require(limit>=1 && limit<=100,422,"INVALID_PAGE_SIZE"); PageCursor page=PageCursor.parse(cursor);
        List<Map<String,Object>> rows=page==null?db.rows("SELECT * FROM referral_schema.reservation WHERE user_id=? AND kind='CASHOUT' ORDER BY requested_at DESC,id DESC LIMIT ?",user,limit+1)
            :db.rows("SELECT * FROM referral_schema.reservation WHERE user_id=? AND kind='CASHOUT' AND (requested_at,id)<(?,?) ORDER BY requested_at DESC,id DESC LIMIT ?",user,time(page.at()),page.id(),limit+1);
        boolean more=rows.size()>limit; List<Map<String,Object>> visible=rows.subList(0,Math.min(limit,rows.size()));
        Map<String,Object> result=new LinkedHashMap<>(); result.put("items",visible.stream().map(CashoutService::publicValue).toList());
        result.put("nextCursor",more?new PageCursor(instant(visible.getLast(),"requested_at"),uuid(visible.getLast(),"id")).encode():null);
        return result;
    }
    public static Map<String,Object> policyValue(Map<String,Object> row) {
        return Map.of("revision",Long.toString(number(row,"id")),"ratesBps",List.of(number(row,"l1_bps"),number(row,"l2_bps"),number(row,"l3_bps")),
            "capBps",number(row,"cap_bps"),"holdDays",number(row,"hold_days"),"minimumPaise",Long.toString(number(row,"minimum_paise")),
            "customerBonusPaise",Long.toString(number(row,"customer_bonus_paise")),"inviteeDiscountPaise",Long.toString(number(row,"invitee_discount_paise")),"unusedShare","retain");
    }
}
