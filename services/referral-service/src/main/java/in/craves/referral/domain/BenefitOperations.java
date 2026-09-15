package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralSettings;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;

@Service
public class BenefitOperations {
    private final Store db;
    private final WalletSpendService spend;
    private final InviteeDiscountService discount;
    private final ReferralSettings settings;
    public BenefitOperations(Store db,WalletSpendService spend,InviteeDiscountService discount,ReferralSettings settings) {
        this.db=db; this.spend=spend; this.discount=discount; this.settings=settings;
    }
    public JsonNode apply(String source,JsonNode envelope) {
        settings.requireEnabled();
        Json.fields(envelope,"operationId","operationType","payload");
        UUID id=Json.uuid(envelope,"operationId"); String type=Json.text(envelope,"operationType",40), hash=Json.hash(envelope);
        boolean allowed=source.equals("order") && List.of("spend.reserve","spend.consume","spend.release","discount.reserve","discount.consume","discount.release").contains(type)
            || source.equals("finance") && type.equals("spend.refund");
        require(allowed,403,"SOURCE_OPERATION_FORBIDDEN");
        return db.tx(() -> {
            db.jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"referral-operation:"+source+":"+id);
            List<Map<String,Object>> existing=db.rows("SELECT payload_hash,result FROM referral_schema.operation_receipt WHERE source=? AND operation_id=?",source,id);
            if(!existing.isEmpty()) {
                require(hash.equals(existing.getFirst().get("payload_hash")),409,"OPERATION_ID_CONFLICT");
                return Json.parse(existing.getFirst().get("result").toString());
            }
            JsonNode body=envelope.get("payload");
            Map<String,Object> result=switch(type) {
                case "spend.reserve" -> spend.reserve(body);
                case "spend.consume" -> spend.finish(body,true);
                case "spend.release" -> spend.finish(body,false);
                case "spend.refund" -> spend.refund(body);
                case "discount.reserve" -> discount.reserve(body);
                case "discount.consume" -> discount.finish(body,true);
                case "discount.release" -> discount.finish(body,false);
                default -> throw new IllegalStateException("Unreachable operation");
            };
            db.update("INSERT INTO referral_schema.operation_receipt(source,operation_id,operation_type,payload_hash,result) VALUES (?,?,?,?,?::jsonb)",source,id,type,hash,Json.write(result));
            return Json.MAPPER.valueToTree(result);
        });
    }
}
