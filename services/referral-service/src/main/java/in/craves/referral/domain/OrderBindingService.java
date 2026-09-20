package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Accepts only the authenticated Order producer; never browser-supplied commercial values. */
@Service
public class OrderBindingService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final Clock clock;
    public OrderBindingService(Store db,ProgramService program,OrderLocks locks,Clock clock) {
        this.db=db; this.program=program; this.locks=locks; this.clock=clock;
    }
    public void bind(JsonNode body) {
        Json.fields(body,"chefOrderId","checkoutId","buyerUserId","sellingChefUserId","foodSubtotalPaise",
            "checkoutFoodSubtotalPaise","checkoutPayablePaise","chefOrderCount","createdAt","sourceSnapshotHash","currency");
        UUID order=Json.uuid(body,"chefOrderId"), checkout=Json.uuid(body,"checkoutId");
        UUID buyer=Json.uuid(body,"buyerUserId"), seller=Json.uuid(body,"sellingChefUserId");
        long food=Json.money(body,"foodSubtotalPaise"), checkoutFood=Json.money(body,"checkoutFoodSubtotalPaise"), payable=Json.money(body,"checkoutPayablePaise");
        int count=Json.integer(body,"chefOrderCount",1,100); Instant created=Json.instant(body,"createdAt");
        require("INR".equals(Json.text(body,"currency",3)),422,"INR_REQUIRED");
        require(food<=checkoutFood && !created.isAfter(clock.instant().plusSeconds(60)),422,"INVALID_ORDER_BINDING");
        String sourceHash=ProgramService.hash(body,"sourceSnapshotHash",true), bindingHash=Json.hash(body);
        List<Map<String,Object>> existing=db.rows("SELECT binding_hash FROM referral_schema.order_snapshot WHERE order_id=?",order);
        if(!existing.isEmpty()) {
            ProgramService.same(existing.getFirst().get("binding_hash"),bindingHash,"ORDER_BINDING_CONFLICT"); return;
        }
        Map<String,Object> policy=program.policyAt(created);
        Map<String,Object> sellingMember=db.one("SELECT * FROM referral_schema.member WHERE user_id=?",seller);
        require(!instant(sellingMember,"registered_at").isAfter(created),422,"ORDER_PRECEDES_ACCOUNT");
        if(!in.craves.referral.core.ChefReferralPolicy.VERSION.equals(policy.get("program_kind"))) {
            Map<String,Object> buyingMember=db.one("SELECT * FROM referral_schema.member WHERE user_id=?",buyer);
            require(!instant(buyingMember,"registered_at").isAfter(created),422,"ORDER_PRECEDES_ACCOUNT");
        }
        db.update("INSERT INTO referral_schema.checkout(checkout_id,buyer_id,food_paise,payable_paise,chef_order_count,policy_id,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(checkout_id) DO NOTHING",
            checkout,buyer,checkoutFood,payable,count,number(policy,"id"),time(created));
        Map<String,Object> frozen=locks.lockCheckout(checkout);
        require(uuid(frozen,"buyer_id").equals(buyer) && number(frozen,"food_paise")==checkoutFood
            && number(frozen,"payable_paise")==payable && number(frozen,"chef_order_count")==count
            && number(frozen,"policy_id")==number(policy,"id") && instant(frozen,"created_at").equals(created),409,"CHECKOUT_BINDING_CONFLICT");
        existing=db.rows("SELECT binding_hash FROM referral_schema.order_snapshot WHERE order_id=?",order);
        if(!existing.isEmpty()) {
            ProgramService.same(existing.getFirst().get("binding_hash"),bindingHash,"ORDER_BINDING_CONFLICT"); return;
        }
        require(db.count("SELECT count(*) FROM referral_schema.order_snapshot WHERE checkout_id=?",checkout)<count,409,"TOO_MANY_CHEF_ORDERS");
        List<UUID> path=new ArrayList<>(array(sellingMember,"path")); path.removeLast(); Collections.reverse(path);
        List<UUID> ancestors=path.subList(0,Math.min(3,path.size()));
        String ancestorArray="{"+String.join(",",ancestors.stream().map(UUID::toString).toList())+"}";
        db.update("INSERT INTO referral_schema.order_snapshot(order_id,checkout_id,seller_id,food_paise,ancestor_ids,source_hash,created_at,binding_hash) VALUES (?,?,?,?,?::uuid[],?,?,?)",
            order,checkout,seller,food,ancestorArray,sourceHash,time(created),bindingHash);
        db.update("INSERT INTO referral_schema.order_state(order_id) VALUES (?)",order);
        long boundCount=db.count("SELECT count(*) FROM referral_schema.order_snapshot WHERE checkout_id=?",checkout);
        long boundFood=db.count("SELECT COALESCE(sum(food_paise),0) FROM referral_schema.order_snapshot WHERE checkout_id=?",checkout);
        require(boundFood<=checkoutFood && (boundCount<count || boundFood==checkoutFood),409,"CHEF_ALLOCATION_MISMATCH");
        if(buyer.equals(seller) || ancestors.contains(buyer)) {
            for(UUID ancestor:ancestors)
                program.fraud(ancestor,"related-purchase:"+order+":"+ancestor,"RELATED_ACCOUNT_PURCHASE",order.toString());
        }
        db.audit("source:order","ORDER_BOUND",order.toString(),Map.of("checkoutId",checkout.toString(),"policyRevision",Long.toString(number(policy,"id"))));
    }

    public void firstCheckout(JsonNode body) {
        Json.fields(body,"checkoutId","buyerUserId","firstQualifyingDelivered","confirmedAt","evidenceRef");
        UUID id=Json.uuid(body,"checkoutId"), buyer=Json.uuid(body,"buyerUserId");
        Map<String,Object> checkout=locks.lockCheckout(id);
        require(Json.bool(body,"firstQualifyingDelivered"),422,"AUTHORITATIVE_FIRST_ORDER_REQUIRED");
        require(uuid(checkout,"buyer_id").equals(buyer),409,"BUYER_MISMATCH");
        require(number(checkout,"food_paise")>=program.policy(program.policyById(number(checkout,"policy_id"))).minimumPaise(),422,"FIRST_ORDER_BELOW_MINIMUM");
        Instant confirmed=Json.instant(body,"confirmedAt");
        require(!confirmed.isBefore(instant(checkout,"created_at")) && !confirmed.isAfter(clock.instant().plusSeconds(60)),422,"INVALID_FIRST_ORDER_CONFIRMATION");
        String hash=Json.hash(body), evidence=Json.text(body,"evidenceRef",180);
        List<Map<String,Object>> old=db.rows("SELECT * FROM referral_schema.first_checkout_claim WHERE buyer_id=?",buyer);
        if(!old.isEmpty()) {
            require(uuid(old.getFirst(),"checkout_id").equals(id) && old.getFirst().get("source_hash").equals(hash),409,"FIRST_ORDER_CLAIM_CONFLICT"); return;
        }
        db.update("INSERT INTO referral_schema.first_checkout_claim(buyer_id,checkout_id,source_hash,confirmed_at) VALUES (?,?,?,?)",buyer,id,hash,time(confirmed));
        db.update("UPDATE referral_schema.checkout SET first_qualifying_confirmed=true WHERE checkout_id=?",id);
        db.audit("source:order","FIRST_QUALIFYING_CHECKOUT_ATTESTED",id.toString(),Map.of("evidenceRef",evidence));
    }
}
