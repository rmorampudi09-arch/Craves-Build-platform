package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Order-only reservation/consumption. Finance-only, cumulative restoration of previously spent credit. */
@Service
public class WalletSpendService {
    private final Store db;
    private final ProgramService program;
    private final ReferralSettings settings;
    private final Clock clock;
    public WalletSpendService(Store db,ProgramService program,ReferralSettings settings,Clock clock) {
        this.db=db; this.program=program; this.settings=settings; this.clock=clock;
    }
    public Map<String,Object> reserve(JsonNode body) {
        require(settings.spendingEnabled(),503,"WALLET_SPENDING_DISABLED");
        Json.fields(body,"reservationId","userId","checkoutId","amountPaise","evidenceRef");
        UUID id=Json.uuid(body,"reservationId"), user=Json.uuid(body,"userId"), checkout=Json.uuid(body,"checkoutId");
        long amount=Json.money(body,"amountPaise"); String evidence=Json.text(body,"evidenceRef",180);
        require(amount>0,422,"POSITIVE_SPEND_REQUIRED");
        db.lockWallets(List.of(user));
        List<Map<String,Object>> old=db.rows("SELECT * FROM referral_schema.reservation WHERE id=?",id);
        if(!old.isEmpty()) {
            Map<String,Object> row=old.getFirst();
            require(row.get("kind").equals("SPEND") && user.equals(uuid(row,"user_id")) && checkout.equals(uuid(row,"checkout_id"))
                && amount==number(row,"amount_paise"),409,"SPEND_RESERVATION_CONFLICT"); return CashoutService.publicValue(row);
        }
        require(!program.held(user),409,"RECIPIENT_ON_HOLD");
        require(db.count("SELECT available_paise FROM referral_schema.wallet WHERE user_id=?",user)>=amount,409,"INSUFFICIENT_AVAILABLE_BALANCE");
        db.update("INSERT INTO referral_schema.reservation(id,user_id,kind,checkout_id,amount_paise,status,requested_at,updated_at) VALUES (?,?,'SPEND',?,?,'RESERVED',?,?)",
            id,user,checkout,amount,time(clock.instant()),time(clock.instant()));
        db.journal("reserve:"+id,user,0,-amount,amount,"INTERNAL_TRANSFER",null,id);
        db.audit("source:order","CHECKOUT_CREDIT_RESERVED",id.toString(),Map.of("checkoutId",checkout.toString(),"evidenceRef",evidence));
        return CashoutService.publicValue(db.one("SELECT * FROM referral_schema.reservation WHERE id=?",id));
    }
    public Map<String,Object> finish(JsonNode body,boolean consume) {
        Json.fields(body,"reservationId","userId","checkoutId","evidenceRef","checkoutCancellationConfirmed");
        UUID id=Json.uuid(body,"reservationId"), user=Json.uuid(body,"userId"), checkout=Json.uuid(body,"checkoutId");
        String evidence=Json.text(body,"evidenceRef",180);
        if(consume) require(settings.spendingEnabled(),503,"WALLET_SPENDING_DISABLED");
        else require(Json.bool(body,"checkoutCancellationConfirmed"),422,"AUTHORITATIVE_CANCELLATION_REQUIRED");
        db.lockWallets(List.of(user));
        Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
        require(row.get("kind").equals("SPEND") && user.equals(uuid(row,"user_id")) && checkout.equals(uuid(row,"checkout_id")),404,"SPEND_NOT_FOUND");
        String target=consume?"SPENT":"RELEASED";
        if(row.get("status").equals(target)) return CashoutService.publicValue(row);
        require(row.get("status").equals("RESERVED"),409,"SPEND_TERMINAL_CONFLICT");
        long amount=number(row,"amount_paise");
        if(consume) {
            Map<String,Object> order=db.one("SELECT buyer_id,created_at FROM referral_schema.checkout WHERE checkout_id=?",checkout);
            require(user.equals(uuid(order,"buyer_id")),409,"CHECKOUT_BUYER_MISMATCH");
            require(!program.held(user) && db.count("SELECT available_paise FROM referral_schema.wallet WHERE user_id=?",user)>=0,409,"RECIPIENT_ON_HOLD");
            db.journal("spend:"+id,user,0,0,-amount,"CHECKOUT_CLEARING",null,checkout);
        } else db.journal("release:"+id,user,0,amount,-amount,"INTERNAL_TRANSFER",null,id);
        db.update("UPDATE referral_schema.reservation SET status=?,updated_at=? WHERE id=?",target,time(clock.instant()),id);
        if(consume) db.update("INSERT INTO referral_schema.spend_refund(reservation_id) VALUES (?)",id);
        db.audit("source:order","CHECKOUT_CREDIT_"+target,id.toString(),Map.of("evidenceRef",evidence));
        return CashoutService.publicValue(db.one("SELECT * FROM referral_schema.reservation WHERE id=?",id));
    }
    public Map<String,Object> refund(JsonNode body) {
        Json.fields(body,"reservationId","version","cumulativeRefundPaise","evidenceRef");
        UUID id=Json.uuid(body,"reservationId"); int version=Json.integer(body,"version",1,Integer.MAX_VALUE);
        long cumulative=Json.money(body,"cumulativeRefundPaise"); String hash=Json.hash(body), evidence=Json.text(body,"evidenceRef",180);
        UUID user=uuid(db.one("SELECT user_id FROM referral_schema.reservation WHERE id=?",id),"user_id");
        db.lockWallets(List.of(user));
        Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
        require(row.get("kind").equals("SPEND") && row.get("status").equals("SPENT"),409,"CREDIT_NOT_SPENT");
        Map<String,Object> state=db.one("SELECT * FROM referral_schema.spend_refund WHERE reservation_id=? FOR UPDATE",id);
        long oldVersion=number(state,"source_version");
        if(version<=oldVersion) {
            require(version<oldVersion || hash.equals(state.get("source_hash")),409,"SPEND_REFUND_VERSION_CONFLICT");
            return Map.of("refundedPaise",Long.toString(number(state,"refunded_paise")));
        }
        long old=number(state,"refunded_paise");
        require(cumulative>=old && cumulative<=number(row,"amount_paise"),422,"SPEND_REFUND_OUT_OF_RANGE");
        if(cumulative>old) db.journal("spend-refund:"+id+":"+version,user,0,cumulative-old,0,"CHECKOUT_CLEARING",null,uuid(row,"checkout_id"));
        db.update("UPDATE referral_schema.spend_refund SET refunded_paise=?,source_version=?,source_hash=? WHERE reservation_id=?",cumulative,version,hash,id);
        db.audit("source:finance","CHECKOUT_CREDIT_RESTORED",id.toString(),Map.of("cumulativePaise",Long.toString(cumulative),"evidenceRef",evidence));
        return Map.of("refundedPaise",Long.toString(cumulative));
    }
}
