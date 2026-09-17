package in.craves.referral.client;

import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BoundedSourceBodyTest {
    static class Subscription implements Flow.Subscription {
        boolean cancelled;
        @Override public void request(long n) { }
        @Override public void cancel() { cancelled=true; }
    }
    @Test void acceptsExactlyTheLimitAndRejectsOverflow() {
        BoundedSourceBody good=new BoundedSourceBody(4); Subscription one=new Subscription(); good.onSubscribe(one);
        good.onNext(List.of(ByteBuffer.wrap(new byte[]{1,2}),ByteBuffer.wrap(new byte[]{3,4}))); good.onComplete();
        assertArrayEquals(new byte[]{1,2,3,4},good.getBody().toCompletableFuture().join());
        BoundedSourceBody bad=new BoundedSourceBody(4); Subscription two=new Subscription(); bad.onSubscribe(two);
        bad.onNext(List.of(ByteBuffer.wrap(new byte[5]))); assertTrue(two.cancelled); assertTrue(bad.getBody().toCompletableFuture().isCompletedExceptionally());
    }
    @Test void deadlineCancelsCurrentAndLateSubscriptions() {
        BoundedSourceBody current=new BoundedSourceBody(4); Subscription one=new Subscription(); current.onSubscribe(one); current.abort(); assertTrue(one.cancelled);
        BoundedSourceBody late=new BoundedSourceBody(4); late.abort(); Subscription two=new Subscription(); late.onSubscribe(two); assertTrue(two.cancelled);
    }
}
