package in.craves.order.referrals.transport;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/** Receives bounded byte pages and cancels the HTTP subscription on overflow or deadline. */
final class BoundedSourceBody implements HttpResponse.BodySubscriber<byte[]> {
    private final int limit;
    private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    private final CompletableFuture<byte[]> result=new CompletableFuture<>();
    private Flow.Subscription subscription;
    BoundedSourceBody(int limit) { if(limit<=0) throw new IllegalArgumentException("Positive body limit required"); this.limit=limit; }
    @Override public CompletionStage<byte[]> getBody() { return result; }
    @Override public synchronized void onSubscribe(Flow.Subscription next) {
        if(subscription!=null || result.isDone()) { next.cancel(); return; }
        subscription=next; next.request(1);
    }
    @Override public synchronized void onNext(List<ByteBuffer> buffers) {
        if(result.isDone()) return;
        long incoming=buffers.stream().mapToLong(ByteBuffer::remaining).sum();
        if(incoming>limit-bytes.size()) { abort(); return; }
        for(ByteBuffer buffer:buffers) { byte[] chunk=new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk); }
        if(subscription!=null) subscription.request(1);
    }
    @Override public synchronized void onError(Throwable error) { result.completeExceptionally(error); }
    @Override public synchronized void onComplete() { result.complete(bytes.toByteArray()); }
    synchronized void abort() {
        if(subscription!=null) subscription.cancel();
        result.completeExceptionally(new IOException("REFERRAL_RESPONSE_BOUNDED_ABORT"));
    }
}
