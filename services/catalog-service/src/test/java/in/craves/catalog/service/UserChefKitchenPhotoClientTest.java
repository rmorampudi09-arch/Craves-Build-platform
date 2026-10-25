package in.craves.catalog.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import in.craves.catalog.config.UserChefClientProperties;
import java.net.InetSocketAddress;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Catalog's pull of an approved chef's registration kitchen photos from user-chef-service. */
class UserChefKitchenPhotoClientTest {
    HttpServer server;
    final AtomicInteger status = new AtomicInteger(200);
    final AtomicReference<String> contentType = new AtomicReference<>("image/png");
    final AtomicReference<byte[]> body = new AtomicReference<>(new byte[] {1, 2, 3});
    final AtomicReference<String> seenSecret = new AtomicReference<>();
    final AtomicReference<String> seenPath = new AtomicReference<>();
    final AtomicInteger requests = new AtomicInteger();
    final UserChefClientProperties properties = new UserChefClientProperties();
    final UUID identityId = UUID.randomUUID();

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            seenSecret.set(exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));
            seenPath.set(exchange.getRequestURI().toString());
            exchange.getResponseHeaders().add("Content-Type", contentType.get());
            byte[] bytes = status.get() == 200 ? body.get() : new byte[0];
            exchange.sendResponseHeaders(status.get(), bytes.length == 0 ? -1 : bytes.length);
            if (bytes.length > 0) exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        properties.setInternalBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/");
        properties.setInternalSecret("synthetic-secret");
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    UserChefKitchenPhotoClient client() {
        return new UserChefKitchenPhotoClient(properties);
    }

    @Test
    void sendsSecretAndIdentityAndReturnsThePhoto() {
        var photo = client().fetch(identityId, 2).orElseThrow();

        assertArrayEquals(new byte[] {1, 2, 3}, photo.data());
        assertEquals("image/png", photo.contentType());
        assertEquals("synthetic-secret", seenSecret.get());
        assertEquals("/internal/v1/chef-kitchen-photos/2?identityId=" + identityId, seenPath.get());
    }

    @Test
    void notFoundMeansNoPhoto() {
        status.set(404);
        assertTrue(client().fetch(identityId, 1).isEmpty());
    }

    @Test
    void serverErrorThrowsSoTheKitchenIsRetriedLater() {
        status.set(503);
        assertThrows(IllegalStateException.class, () -> client().fetch(identityId, 1));
    }

    @Test
    void blankSettingsThrowWithoutCalling() {
        properties.setInternalSecret(" ");
        assertThrows(IllegalStateException.class, () -> client().fetch(identityId, 1));
        assertEquals(0, requests.get());
    }

    @Test
    void anythingButJpegOrPngIsRefused() {
        contentType.set("application/pdf");
        assertThrows(IllegalStateException.class, () -> client().fetch(identityId, 1));
    }

    @Test
    void aPhotoOverTenMegabytesIsRefused() {
        body.set(new byte[10 * 1024 * 1024 + 1]);
        assertThrows(IllegalStateException.class, () -> client().fetch(identityId, 1));
    }
}
