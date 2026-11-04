package in.craves.advanced.platform.clients;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/** A response body read into memory up to {@code max} bytes; a longer body cancels the read and completes with null. */
public final class CappedBody {
    private CappedBody() { }

    public static HttpResponse.BodyHandler<byte[]> handler(int max) {
        return info -> new HttpResponse.BodySubscriber<>() {
            private final ByteArrayOutputStream out = new ByteArrayOutputStream();
            private final CompletableFuture<byte[]> result = new CompletableFuture<>();
            private Flow.Subscription subscription;

            @Override
            public CompletionStage<byte[]> getBody() {
                return result;
            }

            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                this.subscription = subscription;
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(List<ByteBuffer> buffers) {
                if (result.isDone()) return;
                for (ByteBuffer buffer : buffers) {
                    if (out.size() + buffer.remaining() > max) {
                        subscription.cancel();
                        result.complete(null);
                        return;
                    }
                    byte[] chunk = new byte[buffer.remaining()];
                    buffer.get(chunk);
                    out.write(chunk, 0, chunk.length);
                }
            }

            @Override
            public void onError(Throwable error) {
                result.completeExceptionally(error);
            }

            @Override
            public void onComplete() {
                result.complete(out.toByteArray());
            }
        };
    }
}
