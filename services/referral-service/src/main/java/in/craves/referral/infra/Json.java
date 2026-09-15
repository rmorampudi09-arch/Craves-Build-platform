package in.craves.referral.infra;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.referral.ReferralProblem;
import in.craves.referral.core.RewardPolicy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

public final class Json {
    public static final ObjectMapper MAPPER=new ObjectMapper(JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(32).maxStringLength(131072).maxNumberLength(30).build()).build()).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).findAndRegisterModules();
    private Json() { }
    public static JsonNode parse(String value) {
        try { JsonNode result=MAPPER.readTree(value); if(result==null) throw new IllegalArgumentException(); return result; }
        catch(Exception ex) { throw new ReferralProblem(422,"INVALID_JSON"); }
    }
    public static String write(Object value) {
        try { return MAPPER.writeValueAsString(value); }
        catch(Exception ex) { throw new IllegalStateException("Cannot serialize referral value",ex); }
    }
    private static void object(JsonNode value) { ReferralProblem.require(value!=null && value.isObject(),422,"OBJECT_REQUIRED"); }
    public static String text(JsonNode value,String key,int maximum) {
        object(value); JsonNode node=value.get(key);
        ReferralProblem.require(node!=null && node.isTextual() && !node.textValue().isBlank() && node.textValue().length()<=maximum,422,"INVALID_"+key.toUpperCase(java.util.Locale.ROOT));
        return node.textValue();
    }
    public static String optionalText(JsonNode value,String key,int maximum) {
        object(value); JsonNode node=value.get(key); return node==null || node.isNull()?null:text(value,key,maximum);
    }
    public static UUID uuid(JsonNode value,String key) {
        String text=text(value,key,36);
        ReferralProblem.require(text.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),422,"INVALID_UUID");
        return UUID.fromString(text);
    }
    public static Instant instant(JsonNode value,String key) {
        try {
            Instant at=Instant.parse(text(value,key,40));
            ReferralProblem.require(at.getNano()%1000==0,422,"TIMESTAMP_EXCEEDS_DATABASE_PRECISION");
            return at;
        } catch(java.time.format.DateTimeParseException ex) { throw new ReferralProblem(422,"INVALID_TIMESTAMP"); }
    }
    public static long money(JsonNode value,String key) {
        String raw=text(value,key,16);
        ReferralProblem.require(raw.matches("0|[1-9][0-9]{0,12}"),422,"INVALID_PAISE_STRING");
        long amount=Long.parseLong(raw);
        ReferralProblem.require(amount<=RewardPolicy.MAX_MONEY,422,"MONEY_OUT_OF_RANGE"); return amount;
    }
    public static int integer(JsonNode value,String key,int min,int max) {
        object(value); JsonNode node=value.get(key);
        ReferralProblem.require(node!=null && node.isIntegralNumber() && node.canConvertToInt(),422,"INVALID_INTEGER");
        int number=node.intValue(); ReferralProblem.require(number>=min && number<=max,422,"INTEGER_OUT_OF_RANGE"); return number;
    }
    public static boolean bool(JsonNode value,String key) {
        object(value); ReferralProblem.require(value.has(key) && value.get(key).isBoolean(),422,"INVALID_BOOLEAN"); return value.get(key).booleanValue();
    }
    public static void fields(JsonNode value,String... fields) {
        object(value); Set<String> allowed=Set.of(fields);
        value.fieldNames().forEachRemaining(key->ReferralProblem.require(allowed.contains(key),422,"UNKNOWN_FIELD"));
    }
    public static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch(Exception ex) { throw new IllegalStateException(ex); }
    }
    public static String hash(JsonNode node) { return sha256(write(sorted(node)).getBytes(StandardCharsets.UTF_8)); }
    private static JsonNode sorted(JsonNode node) {
        if(node.isObject()) {
            ObjectNode result=MAPPER.createObjectNode(); TreeSet<String> keys=new TreeSet<>(); node.fieldNames().forEachRemaining(keys::add);
            keys.forEach(key->result.set(key,sorted(node.get(key)))); return result;
        }
        if(node.isArray()) { ArrayNode result=MAPPER.createArrayNode(); node.forEach(item->result.add(sorted(item))); return result; }
        return node;
    }
}
