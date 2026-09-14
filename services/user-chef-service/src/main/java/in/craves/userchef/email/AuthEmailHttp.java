package in.craves.userchef.email;

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

/** Whole-response deadline and byte cap, including slow/chunked bodies; no redirect or retry. */
public final class AuthEmailHttp {
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    public HttpResponse<byte[]> get(URI uri,String secret) {
        var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8)).header("Accept","application/json")
            .header("X-Craves-Internal-Secret",secret).GET().build();
        var call=client.sendAsync(request,ignored->new LimitedBody());
        try {return call.get(9,TimeUnit.SECONDS);}
        catch(InterruptedException ex){call.cancel(true);Thread.currentThread().interrupt();throw new IllegalStateException("EMAIL_AUTHORITY_UNAVAILABLE");}
        catch(Exception ex){call.cancel(true);throw new IllegalStateException("EMAIL_AUTHORITY_UNAVAILABLE");}
    }
    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final ByteArrayOutputStream output=new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody(){return result;}
        public void onSubscribe(Flow.Subscription value){subscription=value;value.request(1);}
        public void onNext(List<ByteBuffer> items){
            for(ByteBuffer item:items){
                if(item.remaining()>8192-output.size()){subscription.cancel();result.completeExceptionally(new IllegalStateException("EMAIL_AUTHORITY_UNAVAILABLE"));return;}
                byte[] bytes=new byte[item.remaining()];item.get(bytes);output.writeBytes(bytes);
            }
            subscription.request(1);
        }
        public void onError(Throwable ignored){result.completeExceptionally(new IllegalStateException("EMAIL_AUTHORITY_UNAVAILABLE"));}
        public void onComplete(){result.complete(output.toByteArray());}
    }
}
