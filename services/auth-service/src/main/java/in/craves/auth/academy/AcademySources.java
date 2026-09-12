package in.craves.auth.academy;

import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/** Only catalog-allowlisted files at an immutable Craves commit; no arbitrary URL or file reads. */
@Component
public class AcademySources {
    private final AcademyCatalog catalog;
    private final Map<String, Map<String, String>> cache = new ConcurrentHashMap<>();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private static final Pattern SECRET = Pattern.compile("(?s)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|(?i:AccountKey|client_secret|password|api_key)\\s*[:=]\\s*[\"'][A-Za-z0-9+/=_-]{24,}[\"']");
    public AcademySources(AcademyCatalog catalog) { this.catalog = catalog; }
    public Map<String, String> read(String courseId, int index) {
        String path = catalog.sourcePath(courseId, index);
        if (cache.containsKey(path)) return cache.get(path);
        if (!path.matches("(?:services|apps)/[A-Za-z0-9_./-]+\\.(?:java|ts|tsx|md)") || path.contains("..")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Source is outside the reviewed allowlist");
        }
        String revision = catalog.sourceRevision();
        if (!revision.matches("[a-f0-9]{40}")) throw new IllegalStateException("Source revision must be pinned");
        try {
            URI uri = URI.create("https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/" + revision + "/" + path);
            var response = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            byte[] bytes;
            try (var input = response.body()) {
                if (response.statusCode() != 200) throw new IllegalStateException("Source fetch failed");
                bytes = input.readNBytes(262145);
            }
            if (bytes.length > 262144) throw new IllegalStateException("Source exceeds size limit");
            String code = new String(bytes, StandardCharsets.UTF_8);
            if (SECRET.matcher(code).find()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Source requires security review; no content was disclosed");
            Map<String, String> result = Map.of("path", path, "revision", revision, "code", code,
                "sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
            cache.put(path, result);
            return result;
        } catch (ResponseStatusException e) { throw e;
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Source is temporarily unavailable");
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Pinned source is unavailable; lesson text remains available"); }
    }
}
