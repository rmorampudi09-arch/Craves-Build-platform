package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.TreeSet;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class FinancialJson {
    private FinancialJson() {}
    public static JsonNode canonical(JsonNode node,ObjectMapper json) {
        if(node.isObject()) {
            ObjectNode result=json.createObjectNode();var keys=new TreeSet<String>();node.fieldNames().forEachRemaining(keys::add);
            for(String key:keys)result.set(key,canonical(node.get(key),json));return result;
        }
        if(node.isArray()) {ArrayNode result=json.createArrayNode();for(JsonNode item:node)result.add(canonical(item,json));return result;}
        return node;
    }
    public static String hash(JsonNode node,ObjectMapper json) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(node,json).toString().getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException("Cannot hash financial evidence",e);}
    }
    public static String sign(byte[] body,String secret) {
        if(secret==null || secret.length()<32)throw new IllegalStateException("Finance internal key must contain at least 32 characters");
        try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(body));}
        catch(Exception e){throw new IllegalStateException("Finance signature unavailable",e);}
    }
    public static boolean authentic(byte[] body,String signature,String secret) {
        if(body==null || body.length>524288 || signature==null || !signature.matches("[0-9a-f]{64}") || secret==null || secret.length()<32)return false;
        return MessageDigest.isEqual(HexFormat.of().parseHex(sign(body,secret)),HexFormat.of().parseHex(signature));
    }
}
