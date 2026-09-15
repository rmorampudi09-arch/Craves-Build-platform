package in.craves.notification.documents;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/** No redirects, no arbitrary browser URL, no logging of tokens or response bodies. */
@Component
public class DocumentHttp {
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    public HttpResponse<byte[]> get(URI uri,String header,String value,int maxBytes) {
        var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(15)).header("Accept","application/json")
            .header(header,value).GET().build();
        var call=client.sendAsync(request,info->new LimitedBody(maxBytes));
        try { return call.get(20,TimeUnit.SECONDS); }
        catch (InterruptedException ex) {
            call.cancel(true); Thread.currentThread().interrupt(); throw DocumentModels.upstream("SOURCE_INTERRUPTED");
        } catch (Exception ex) {
            call.cancel(true); throw DocumentModels.upstream("SOURCE_UNAVAILABLE_OR_TOO_LARGE");
        }
    }
    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final int limit;
        private final ByteArrayOutputStream output=new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private Flow.Subscription subscription;
        LimitedBody(int limit) { this.limit=limit; }
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription=value; value.request(1); }
        @Override public void onNext(List<ByteBuffer> items) {
            try {
                for (ByteBuffer buffer:items) {
                    if (buffer.remaining()>limit-output.size()) throw new IllegalStateException("Response limit");
                    byte[] bytes=new byte[buffer.remaining()]; buffer.get(bytes); output.writeBytes(bytes);
                }
                subscription.request(1);
            } catch (RuntimeException ex) { subscription.cancel(); result.completeExceptionally(ex); }
        }
        @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        @Override public void onComplete() { result.complete(output.toByteArray()); }
    }
}
