package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.integration.config.BorzoProperties;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * The HTTP client Borzo bookings go out on sends a POST once, also when the server has closed the kept-alive connection
 * it uses: the case in which the JDK's client may quietly send a request again (sun.net.http.retryPost).
 */
class BorzoSendOnceTest {

    @Test
    void aPostOnAConnectionTheServerClosesIsNotSentAgain() throws Exception {
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            AtomicInteger posts = new AtomicInteger();
            Thread courier = new Thread(() -> serve(server, posts));
            courier.setDaemon(true);
            courier.start();
            RestClient client = RestClient.builder().requestFactory(BorzoApiClient.requestFactory(new BorzoProperties())).build();
            String url = "http://127.0.0.1:" + server.getLocalPort() + "/create-order";

            client.post().uri(url).contentType(MediaType.APPLICATION_JSON).body("{}").retrieve().toBodilessEntity();
            assertThatThrownBy(() -> client.post().uri(url).contentType(MediaType.APPLICATION_JSON).body("{}").retrieve().toBodilessEntity())
                .isInstanceOf(ResourceAccessException.class);

            Thread.sleep(500); // a re-send would have arrived by now
            assertThat(posts).hasValue(2);
        }
    }

    /** Answers the first request, reads the second on the same connection and closes without answering; counts any later one. */
    private static void serve(ServerSocket server, AtomicInteger posts) {
        try (Socket first = server.accept()) {
            readRequest(first.getInputStream());
            posts.incrementAndGet();
            first.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            first.getOutputStream().flush();
            readRequest(first.getInputStream());
            posts.incrementAndGet();
        } catch (IOException ignored) {
            return;
        }
        while (true) {
            try (Socket again = server.accept()) {
                readRequest(again.getInputStream());
                posts.incrementAndGet();
                again.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            } catch (IOException closed) {
                return;
            }
        }
    }

    /** Headers, then the two-byte body the test sends. */
    private static void readRequest(InputStream in) throws IOException {
        StringBuilder head = new StringBuilder();
        while (!head.toString().endsWith("\r\n\r\n")) {
            int next = in.read();
            if (next < 0) {
                throw new IOException("closed");
            }
            head.append((char) next);
        }
        in.readNBytes(2);
    }
}
