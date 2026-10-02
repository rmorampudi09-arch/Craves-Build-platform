import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;

/** Read-only server-side diagnostics. Never prints credentials, recipients or SMS content. */
public final class Msg91DeliveryDiagnostics {
    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !args[0].matches("[A-Za-z0-9_-]{1,200}")) {
            throw new IllegalArgumentException("One provider request ID is required");
        }
        String key = System.getenv("MSG91_AUTHKEY");
        if (key == null || key.isBlank()) { throw new IllegalStateException("Server key unavailable"); }
        String date = LocalDate.now(ZoneOffset.UTC).toString();
        String fields = "requestDate,status,deliveryDate,deliveryTime,requestId,failureReason,statusCode,credit,smsLength,templateID";
        URI uri = URI.create("https://control.msg91.com/api/v5/report/logs/p/otp?startDate="
                + date + "&endDate=" + date + "&limit=10&requestId=" + args[0] + "&fields=" + fields);
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                .header("authkey", key).header("accept", "application/json").GET().build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        byte[] bytes;
        try (var input = response.body()) { bytes = input.readNBytes(32769); }
        var json = new ObjectMapper();
        System.out.println(json.writeValueAsString(Map.of("httpStatus", response.statusCode())));
        if (bytes.length > 32768) { System.out.println("Response exceeded diagnostic limit"); return; }
        JsonNode body = json.readTree(bytes);
        var data = body.path("data");
        if (!data.isArray()) {
            String code = body.path("code").asText();
            System.out.println(json.writeValueAsString(Map.of("providerCode",
                    code.matches("[0-9]{1,6}") ? code : "unclassified", "category", category(body.path("message").asText()))));
            return;
        }
        System.out.println(json.writeValueAsString(Map.of("records", data.size())));
        for (JsonNode row : data) {
            var safe = json.createObjectNode();
            for (String field : fields.split(",")) {
                if (field.equals("failureReason")) { safe.put(field, category(row.path(field).asText())); }
                else {
                    String value = row.path(field).asText();
                    if (value.matches("[A-Za-z0-9_ :./-]{0,100}")) { safe.put(field, value); }
                }
            }
            System.out.println(json.writeValueAsString(safe));
        }
    }

    private static String category(String reason) {
        String text = reason.toLowerCase(java.util.Locale.ROOT);
        if (text.contains("template") && text.contains("match")) { return "template_mismatch"; }
        if (text.contains("balance") || text.contains("credit")) { return "account_balance"; }
        if (text.contains("auth") || text.contains("key")) { return "account_authorization"; }
        if (text.contains("ip")) { return "source_ip_policy"; }
        if (text.isBlank() || text.equals("null") || text.equals("-")) { return "none"; }
        return "other_provider_reason";
    }
}
