package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

// CH-01 regression: without a read timeout a peer that accepts the connection but never answers hangs the caller forever.
class HttpClientTimeoutConfigurationTest {

    @Test
    void outboundCallGivesUpWhenThePeerNeverAnswers() throws Exception {
        try (ServerSocket silentPeer = new ServerSocket(0)) {
            RestClient.Builder builder = RestClient.builder();
            new HttpClientTimeoutConfiguration()
                .outboundHttpTimeouts(Duration.ofSeconds(1), Duration.ofMillis(300))
                .customize(builder);
            RestClient client = builder.baseUrl("http://127.0.0.1:" + silentPeer.getLocalPort()).build();

            assertTimeoutPreemptively(Duration.ofSeconds(10), () ->
                assertThatThrownBy(() -> client.get().uri("/internal/v1/ping").retrieve().toBodilessEntity())
                    .isInstanceOf(ResourceAccessException.class));
        }
    }

    // RestClients built from the injected RestClient.Builder get the timeouts above; everything else must set its own.
    @Test
    void everyOutboundHttpClientSetsConnectAndReadTimeouts() throws IOException {
        List<String> missing = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String code = Files.readString(file);
                for (String bypass : List.of("RestClient.create(", "RestClient.builder(", "new RestTemplate(", "WebClient.",
                    "HttpClient.newHttpClient(", "new JdkClientHttpRequestFactory()", "openConnection(")) {
                    if (code.contains(bypass)) missing.add(file + ": " + bypass + " has no timeouts; use the injected RestClient.Builder");
                }
                for (String chain : chains(code, "HttpClient.newBuilder()", ".build()")) {
                    if (!chain.contains(".connectTimeout(")) missing.add(file + ": java.net.http.HttpClient without connectTimeout");
                }
                for (String chain : chains(code, "HttpRequest.newBuilder(", ";")) {
                    if (!chain.contains(".timeout(")) missing.add(file + ": HttpRequest without a timeout (the JDK client's read timeout)");
                }
                int factories = count(code, "new SimpleClientHttpRequestFactory(") + count(code, "new JdkClientHttpRequestFactory(");
                if (count(code, "setReadTimeout(") < factories) missing.add(file + ": request factory without setReadTimeout");
                if (count(code, "setConnectTimeout(") < count(code, "new SimpleClientHttpRequestFactory(")) {
                    missing.add(file + ": SimpleClientHttpRequestFactory without setConnectTimeout");
                }
            }
        }
        assertThat(missing).isEmpty();
    }

    private static List<String> chains(String code, String start, String end) {
        List<String> chains = new ArrayList<>();
        for (int at = code.indexOf(start); at >= 0; at = code.indexOf(start, at + 1)) {
            int stop = code.indexOf(end, at);
            chains.add(code.substring(at, stop < 0 ? code.length() : stop));
        }
        return chains;
    }

    private static int count(String code, String text) {
        return code.split(java.util.regex.Pattern.quote(text), -1).length - 1;
    }
}
