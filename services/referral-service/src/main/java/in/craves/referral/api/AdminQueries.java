package in.craves.referral.api;

import in.craves.referral.ReferralSettings;
import in.craves.referral.domain.ProgramService;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.math.BigDecimal;
import java.sql.Timestamp;
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
public class AdminQueries {
    private final Store db;
    private final ProgramService program;
    private final ReferralSettings settings;
    private final Clock clock;
    public AdminQueries(Store db,ProgramService program,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.settings=settings; this.clock=clock;
    }
    public Map<String,Object> overview(UUID actor) {
        settings.requireEnabled(); Map<String,Object> result=new LinkedHashMap<>();
        result.put("viewerId",actor.toString()); result.put("asOf",clock.instant().toString());
        result.put("flags",Map.of("awards",settings.awardsEnabled(),"settlement",settings.settlementEnabled(),"cashout",settings.withdrawalsEnabled(),"spending",settings.spendingEnabled()));
        result.put("members",Long.toString(db.count("SELECT count(*) FROM referral_schema.member")));
        result.put("pendingPaise",Long.toString(db.count("SELECT COALESCE(sum(pending_paise),0) FROM referral_schema.wallet")));
        result.put("availablePaise",Long.toString(db.count("SELECT COALESCE(sum(available_paise),0) FROM referral_schema.wallet")));
        result.put("reservedPaise",Long.toString(db.count("SELECT COALESCE(sum(reserved_paise),0) FROM referral_schema.wallet")));
        result.put("fraudOpen",Long.toString(db.count("SELECT count(*) FROM referral_schema.fraud_case WHERE status='OPEN'")));
        result.put("inboxDead",Long.toString(db.count("SELECT count(*) FROM referral_schema.inbox WHERE status='DEAD'")));
        result.put("outboxDead",Long.toString(db.count("SELECT count(*) FROM referral_schema.outbox WHERE status='DEAD'")));
        result.put("unknownCashouts",Long.toString(db.count("SELECT count(*) FROM referral_schema.reservation WHERE kind='CASHOUT' AND status='UNKNOWN'")));
        result.put("walletDriftCount",Long.toString(db.count("SELECT count(*) FROM referral_schema.wallet w LEFT JOIN (SELECT user_id,sum(pending_delta) p,sum(available_delta) a,sum(reserved_delta) r FROM referral_schema.journal GROUP BY user_id) j ON j.user_id=w.user_id WHERE w.pending_paise<>COALESCE(j.p,0) OR w.available_paise<>COALESCE(j.a,0) OR w.reserved_paise<>COALESCE(j.r,0)")));
        result.put("budgets",db.rows("SELECT track,available_paise::text AS \"availablePaise\" FROM referral_schema.budget ORDER BY track"));
        return result;
    }
    public Map<String,Object> policies() {
        settings.requireEnabled(); List<Map<String,Object>> rows=program.policies(), items=new ArrayList<>();
        long active=db.count("SELECT COALESCE((SELECT policy_id FROM referral_schema.policy_activation WHERE effective_at<=? ORDER BY effective_at DESC LIMIT 1),0)",time(clock.instant()));
        for(Map<String,Object> row:rows) {
            Map<String,Object> item=new LinkedHashMap<>(MemberQueries.policyValue(row));
            item.put("createdBy",row.get("created_by")==null?null:row.get("created_by").toString());
            item.put("createdAt",instant(row,"created_at").toString());
            item.put("effectiveAt",instant(row,"effective_at")==null?null:instant(row,"effective_at").toString());
            item.put("approvedBy",row.get("approved_by")==null?null:row.get("approved_by").toString());
            item.put("approvals",Json.parse(row.get("approvals").toString()));
            item.put("state",instant(row,"effective_at")==null?"DRAFT":instant(row,"effective_at").isAfter(clock.instant())?"SCHEDULED":number(row,"id")==active?"ACTIVE":"RETIRED");
            items.add(item);
        }
        return Map.of("items",items,"activeRevision",Long.toString(active),"latestRevision",Long.toString(db.count("SELECT max(id) FROM referral_schema.policy")),
            "latestActivatedRevision",Long.toString(db.count("SELECT COALESCE(max(policy_id),0) FROM referral_schema.policy_activation")));
    }
    public Map<String,Object> queue(String name,String state,int limit,String cursor) {
        settings.requireEnabled(); require(limit>=1 && limit<=100,422,"INVALID_PAGE_SIZE"); PageCursor page=PageCursor.parse(cursor);
        String sql; String date;
        switch(name) {
            case "fraud" -> {
                require(List.of("OPEN","CLEARED","CONFIRMED").contains(state),422,"INVALID_QUEUE_STATE");
                sql="SELECT id,user_id,reason_code,status,evidence_ref,opened_at FROM referral_schema.fraud_case WHERE status=?"; date="opened_at";
            }
            case "cashouts" -> {
                require(List.of("RESERVED","APPROVED","SUBMITTED","PAID","UNKNOWN","RELEASED").contains(state),422,"INVALID_QUEUE_STATE");
                sql="SELECT id,user_id,amount_paise::text AS amount_paise,status,requested_at,net_paise::text AS net_paise,withholding_paise::text AS withholding_paise,approved_by,approval_ref,attempt_id,provider_ref FROM referral_schema.reservation WHERE kind='CASHOUT' AND status=?"; date="requested_at";
            }
            case "outbox" -> {
                require(List.of("PENDING","LEASED","ACKED","DEAD").contains(state),422,"INVALID_QUEUE_STATE");
                sql="SELECT id,event_type,status,attempts,created_at FROM referral_schema.outbox WHERE status=?"; date="created_at";
            }
            default -> throw new in.craves.referral.ReferralProblem(404,"QUEUE_NOT_FOUND");
        }
        List<Map<String,Object>> rows=page==null?db.rows(sql+" ORDER BY "+date+" DESC,id DESC LIMIT ?",state,limit+1)
            :db.rows(sql+" AND ("+date+",id)<(?,?) ORDER BY "+date+" DESC,id DESC LIMIT ?",state,time(page.at()),page.id(),limit+1);
        boolean more=rows.size()>limit; List<Map<String,Object>> visible=rows.subList(0,Math.min(limit,rows.size()));
        Map<String,Object> result=new LinkedHashMap<>(); result.put("items",visible.stream().map(AdminQueries::jsonRow).toList());
        result.put("nextCursor",more?new PageCursor(instant(visible.getLast(),date),uuid(visible.getLast(),"id")).encode():null);
        return result;
    }
    public Map<String,Object> inbox(int limit,String source,UUID after) {
        settings.requireEnabled(); require(limit>=1 && limit<=100 && List.of("auth","order","finance").contains(source),422,"INVALID_INBOX_FILTER");
        List<Map<String,Object>> rows=after==null?db.rows("SELECT event_id,aggregate_id,event_type,status,attempts,last_error,received_at FROM referral_schema.inbox WHERE source=? AND status='DEAD' ORDER BY event_id LIMIT ?",source,limit+1)
            :db.rows("SELECT event_id,aggregate_id,event_type,status,attempts,last_error,received_at FROM referral_schema.inbox WHERE source=? AND status='DEAD' AND event_id>? ORDER BY event_id LIMIT ?",source,after,limit+1);
        boolean more=rows.size()>limit; List<Map<String,Object>> visible=rows.subList(0,Math.min(limit,rows.size()));
        Map<String,Object> result=new LinkedHashMap<>(); result.put("items",visible.stream().map(AdminQueries::jsonRow).toList());
        result.put("nextId",more?uuid(visible.getLast(),"event_id").toString():null); return result;
    }
    public Map<String,Object> audit(long after,int limit) {
        settings.requireEnabled(); require(after>=0 && limit>=1 && limit<=500,422,"INVALID_AUDIT_PAGE");
        List<Map<String,Object>> rows=db.rows("SELECT id,actor,action,target,detail,created_at FROM referral_schema.audit WHERE id>? ORDER BY id LIMIT ?",after,limit);
        List<Map<String,Object>> items=new ArrayList<>();
        for(Map<String,Object> row:rows) {
            Map<String,Object> item=jsonRow(row); item.put("id",Long.toString(number(row,"id")));
            item.put("detail",Json.parse(row.get("detail").toString())); items.add(item);
        }
        return Map.of("items",items,"nextId",rows.isEmpty()?Long.toString(after):Long.toString(number(rows.getLast(),"id")),"hasMore",rows.size()==limit);
    }
    private static Map<String,Object> jsonRow(Map<String,Object> row) {
        Map<String,Object> result=new LinkedHashMap<>();
        row.forEach((key,value)->result.put(key,value instanceof UUID?value.toString():value instanceof Timestamp stamp?stamp.toInstant().toString():value instanceof BigDecimal decimal?decimal.toPlainString():value));
        return result;
    }
}
