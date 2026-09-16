package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** A separately funded, single-use benefit. An order-authority attestation is mandatory, not a browser claim. */
@Service
public class InviteeDiscountService {
    private final Store db;
    private final ProgramService program;
    private final ReferralSettings settings;
    private final Clock clock;
    public InviteeDiscountService(Store db,ProgramService program,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.settings=settings; this.clock=clock;
    }
    public Map<String,Object> reserve(JsonNode body) {
        require(settings.spendingEnabled(),503,"REFERRAL_DISCOUNT_DISABLED");
        Json.fields(body,"reservationId","buyerUserId","checkoutId","foodSubtotalPaise","createdAt","firstQualifyingOrderEligible","evidenceRef");
        UUID id=Json.uuid(body,"reservationId"), user=Json.uuid(body,"buyerUserId"), checkout=Json.uuid(body,"checkoutId");
        long food=Json.money(body,"foodSubtotalPaise"); Instant created=Json.instant(body,"createdAt");
        require(!created.isAfter(clock.instant().plusSeconds(60)) && created.isAfter(clock.instant().minusSeconds(900)),422,"STALE_DISCOUNT_QUOTE");
        require(Json.bool(body,"firstQualifyingOrderEligible"),422,"AUTHORITATIVE_FIRST_ORDER_REQUIRED");
        String evidence=Json.text(body,"evidenceRef",180);
        db.lockWallets(List.of(user));
        Map<String,Object> member=db.one("SELECT parent_id FROM referral_schema.member WHERE user_id=?",user);
        require(uuid(member,"parent_id")!=null && !program.held(user),409,"INVITEE_NOT_ELIGIBLE");
        Map<String,Object> policy=program.policyAt(created); long amount=number(policy,"invitee_discount_paise");
        require(food>=number(policy,"minimum_paise") && amount>0 && amount<=food,422,"DISCOUNT_ORDER_NOT_QUALIFYING");
        require(db.count("SELECT count(*) FROM referral_schema.first_checkout_claim WHERE buyer_id=?",user)==0,409,"FIRST_ORDER_ALREADY_USED");
        List<Map<String,Object>> old=db.rows("SELECT * FROM referral_schema.discount_reservation WHERE id=?",id);
        if(!old.isEmpty()) {
            Map<String,Object> row=old.getFirst();
            require(user.equals(uuid(row,"buyer_id")) && checkout.equals(uuid(row,"checkout_id")) && amount==number(row,"amount_paise")
                && number(row,"policy_id")==number(policy,"id"),409,"DISCOUNT_RESERVATION_CONFLICT"); return value(row);
        }
        db.update("INSERT INTO referral_schema.discount_reservation(id,buyer_id,checkout_id,policy_id,amount_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,'RESERVED',?,?)",
            id,user,checkout,number(policy,"id"),amount,time(created),time(clock.instant()));
        db.budget("discount-reserve:"+id,"DISCOUNT",-amount,evidence);
        db.audit("source:order","INVITEE_DISCOUNT_RESERVED",id.toString(),Map.of("checkoutId",checkout.toString(),"amountPaise",Long.toString(amount),"evidenceRef",evidence));
        return value(db.one("SELECT * FROM referral_schema.discount_reservation WHERE id=?",id));
    }
    public Map<String,Object> finish(JsonNode body,boolean consume) {
        Json.fields(body,"reservationId","buyerUserId","checkoutId","evidenceRef","checkoutCancellationConfirmed");
        UUID id=Json.uuid(body,"reservationId"), user=Json.uuid(body,"buyerUserId"), checkout=Json.uuid(body,"checkoutId");
        String evidence=Json.text(body,"evidenceRef",180);
        if(consume) require(settings.spendingEnabled(),503,"REFERRAL_DISCOUNT_DISABLED");
        else require(Json.bool(body,"checkoutCancellationConfirmed"),422,"AUTHORITATIVE_CANCELLATION_REQUIRED");
        db.lockWallets(List.of(user));
        Map<String,Object> row=db.one("SELECT * FROM referral_schema.discount_reservation WHERE id=? FOR UPDATE",id);
        require(user.equals(uuid(row,"buyer_id")) && checkout.equals(uuid(row,"checkout_id")),404,"DISCOUNT_NOT_FOUND");
        String target=consume?"CONSUMED":"RELEASED";
        if(row.get("status").equals(target)) return value(row);
        require(row.get("status").equals("RESERVED"),409,"DISCOUNT_TERMINAL_CONFLICT");
        if(consume) {
            Map<String,Object> bound=db.one("SELECT buyer_id,food_paise,policy_id FROM referral_schema.checkout WHERE checkout_id=?",checkout);
            require(user.equals(uuid(bound,"buyer_id")) && number(bound,"policy_id")==number(row,"policy_id")
                && number(bound,"food_paise")>=number(program.policyById(number(row,"policy_id")),"minimum_paise"),409,"DISCOUNT_BINDING_MISMATCH");
        } else db.budget("discount-release:"+id,"DISCOUNT",number(row,"amount_paise"),evidence);
        db.update("UPDATE referral_schema.discount_reservation SET status=?,updated_at=? WHERE id=?",target,time(clock.instant()),id);
        db.audit("source:order","INVITEE_DISCOUNT_"+target,id.toString(),Map.of("evidenceRef",evidence));
        return value(db.one("SELECT * FROM referral_schema.discount_reservation WHERE id=?",id));
    }
    private static Map<String,Object> value(Map<String,Object> row) {
        return Map.of("id",uuid(row,"id").toString(),"amountPaise",Long.toString(number(row,"amount_paise")),"status",row.get("status"),"policyRevision",Long.toString(number(row,"policy_id")));
    }
}
