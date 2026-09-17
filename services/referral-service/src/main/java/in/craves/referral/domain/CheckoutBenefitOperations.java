package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;

/** Atomic combination: a failed wallet reservation also rolls back the discount and its budget debit. */
@Service
public class CheckoutBenefitOperations {
    private final Store db;private final WalletSpendService wallet;private final InviteeDiscountService discount;
    public CheckoutBenefitOperations(Store db,WalletSpendService wallet,InviteeDiscountService discount){this.db=db;this.wallet=wallet;this.discount=discount;}
    public Map<String,Object> reserve(JsonNode p){
        Json.fields(p,"checkoutId","buyerUserId","grossPaise","foodSubtotalPaise","walletPaise","inviteeDiscount","createdAt","firstQualifyingOrderEligible","evidenceRef");
        UUID checkout=Json.uuid(p,"checkoutId"),buyer=Json.uuid(p,"buyerUserId");long gross=Json.money(p,"grossPaise"),food=Json.money(p,"foodSubtotalPaise"),spend=Json.money(p,"walletPaise");
        boolean coupon=Json.bool(p,"inviteeDiscount");String evidence=Json.text(p,"evidenceRef",180);
        require(gross>0 && food<=gross && (spend>0 || coupon),422,"INVALID_CHECKOUT_BENEFITS");
        db.lockWallets(List.of(buyer));long off=0;String policy=null;
        if(coupon){
            var b=Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"discount").toString()).put("buyerUserId",buyer.toString()).put("checkoutId",checkout.toString()).put("foodSubtotalPaise",Long.toString(food)).put("createdAt",Json.instant(p,"createdAt").toString()).put("firstQualifyingOrderEligible",Json.bool(p,"firstQualifyingOrderEligible")).put("evidenceRef",evidence);
            var result=discount.reserve(b);off=Long.parseLong(result.get("amountPaise").toString());policy=result.get("policyRevision").toString();
        }
        require(spend<=Math.subtractExact(gross,off),422,"BENEFITS_EXCEED_CHECKOUT");
        if(spend>0)wallet.reserve(Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"wallet").toString()).put("userId",buyer.toString()).put("checkoutId",checkout.toString()).put("amountPaise",Long.toString(spend)).put("evidenceRef",evidence));
        var result=new LinkedHashMap<String,Object>();result.put("checkoutId",checkout.toString());result.put("buyerUserId",buyer.toString());result.put("grossPaise",Long.toString(gross));result.put("walletPaise",Long.toString(spend));result.put("discountPaise",Long.toString(off));result.put("gatewayPaise",Long.toString(gross-spend-off));result.put("walletReservationId",spend>0?id(checkout,"wallet").toString():null);result.put("discountReservationId",coupon?id(checkout,"discount").toString():null);result.put("policyRevision",policy);result.put("status","RESERVED");return result;
    }
    public Map<String,Object> finish(JsonNode p,boolean consume){
        Json.fields(p,"checkoutId","buyerUserId","walletPaise","discountPaise","evidenceRef","checkoutCancellationConfirmed");
        UUID checkout=Json.uuid(p,"checkoutId"),buyer=Json.uuid(p,"buyerUserId");long spend=Json.money(p,"walletPaise"),off=Json.money(p,"discountPaise");String evidence=Json.text(p,"evidenceRef",180);
        db.lockWallets(List.of(buyer));
        if(consume){
            var bound=db.one("SELECT buyer_id,chef_order_count FROM referral_schema.checkout WHERE checkout_id=?",checkout);
            require(buyer.equals(Store.uuid(bound,"buyer_id")) && db.count("SELECT count(*) FROM referral_schema.order_snapshot WHERE checkout_id=?",checkout)==Store.number(bound,"chef_order_count"),409,"CHECKOUT_BINDING_INCOMPLETE");
        }else require(Json.bool(p,"checkoutCancellationConfirmed"),422,"AUTHORITATIVE_CANCELLATION_REQUIRED");
        if(spend>0){
            require(db.count("SELECT amount_paise FROM referral_schema.reservation WHERE id=? AND user_id=? AND checkout_id=?",id(checkout,"wallet"),buyer,checkout)==spend,409,"WALLET_AMOUNT_CHANGED");
            wallet.finish(Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"wallet").toString()).put("userId",buyer.toString()).put("checkoutId",checkout.toString()).put("evidenceRef",evidence).put("checkoutCancellationConfirmed",!consume),consume);
        }
        if(off>0){
            require(db.count("SELECT amount_paise FROM referral_schema.discount_reservation WHERE id=? AND buyer_id=? AND checkout_id=?",id(checkout,"discount"),buyer,checkout)==off,409,"DISCOUNT_AMOUNT_CHANGED");
            discount.finish(Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"discount").toString()).put("buyerUserId",buyer.toString()).put("checkoutId",checkout.toString()).put("evidenceRef",evidence).put("checkoutCancellationConfirmed",!consume),consume);
        }
        require(spend>0 || off>0,422,"EMPTY_CHECKOUT_BENEFITS");return Map.of("checkoutId",checkout.toString(),"status",consume?"CONSUMED":"RELEASED","walletPaise",Long.toString(spend),"discountPaise",Long.toString(off));
    }
    public Map<String,Object> refund(JsonNode p){
        Json.fields(p,"checkoutId","version","cumulativeWalletPaise","cumulativeDiscountPaise","evidenceRef");
        UUID checkout=Json.uuid(p,"checkoutId");int version=Json.integer(p,"version",1,Integer.MAX_VALUE);long credit=Json.money(p,"cumulativeWalletPaise"),coupon=Json.money(p,"cumulativeDiscountPaise");String evidence=Json.text(p,"evidenceRef",180);
        if(credit>0)wallet.refund(Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"wallet").toString()).put("version",version).put("cumulativeRefundPaise",Long.toString(credit)).put("evidenceRef",evidence));
        if(coupon>0)discount.refund(Json.MAPPER.createObjectNode().put("reservationId",id(checkout,"discount").toString()).put("version",version).put("cumulativeRefundPaise",Long.toString(coupon)).put("evidenceRef",evidence));
        return Map.of("checkoutId",checkout.toString(),"version",version,"walletRefundedPaise",Long.toString(credit),"discountRefundedPaise",Long.toString(coupon));
    }
    public static UUID id(UUID checkout,String kind){return UUID.nameUUIDFromBytes(("referral-checkout/"+checkout+"/"+kind).getBytes(StandardCharsets.UTF_8));}
}
