package in.craves.userchef.email;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;

class AuthEmailHttpTest {
    static class Subscription implements Flow.Subscription { boolean canceled; public void request(long count){} public void cancel(){canceled=true;} }
    @Test void boundedSubscriberAccumulatesCompleteResponse() {
        var subscriber=new AuthEmailHttp.LimitedBody();var subscription=new Subscription();subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[4000]),ByteBuffer.wrap(new byte[4192])));subscriber.onComplete();
        assertEquals(8192,subscriber.getBody().toCompletableFuture().join().length);assertFalse(subscription.canceled);
    }
    @Test void chunkedOversizedResponseIsCanceledAndRejected() {
        var subscriber=new AuthEmailHttp.LimitedBody();var subscription=new Subscription();subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[8192])));subscriber.onNext(List.of(ByteBuffer.wrap(new byte[1])));
        assertTrue(subscription.canceled);assertTrue(subscriber.getBody().toCompletableFuture().isCompletedExceptionally());
    }
    @Test void transportErrorsNeverExposeSourceMessage() {
        var subscriber=new AuthEmailHttp.LimitedBody();subscriber.onSubscribe(new Subscription());subscriber.onError(new IllegalStateException("private upstream detail"));
        var error=assertThrows(java.util.concurrent.CompletionException.class,()->subscriber.getBody().toCompletableFuture().join());
        assertEquals("EMAIL_AUTHORITY_UNAVAILABLE",error.getCause().getMessage());
    }
}
