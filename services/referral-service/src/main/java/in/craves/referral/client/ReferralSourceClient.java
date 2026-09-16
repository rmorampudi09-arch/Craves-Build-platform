package in.craves.referral.client;

import in.craves.referral.security.SourceSignatures;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Explicit, non-autowired source adapter. Construction sends and subscribes to nothing.
 * Persist the envelope and its event/operation ID in the producer's transactional outbox
 * before calling this client. A timeout is unknown: replay the SAME envelope and ID.
 * Never log keys, source snapshots, response bodies or bearer tokens.
 */
public final class ReferralSourceClient implements AutoCloseable {
    public enum Endpoint {
        EVENTS("/internal/v1/referrals/events"), OPERATIONS("/internal/v1/referrals/operations"),
        CLAIM("/internal/v1/referrals/outbox/claim"), ACK("/internal/v1/referrals/outbox/ack");
        private final String path;
        Endpoint(String path) { this.path=path; }
        public String path() { return path; }
    }
    public record Prepared(URI uri,Map<String,String> headers,byte[] body) {
        public Prepared { headers=Map.copyOf(headers); body=body.clone(); }
        @Override public byte[] body() { return body.clone(); }
    }
    public record Reply(int status,byte[] body) {
        public Reply { body=body.clone(); }
        @Override public byte[] body() { return body.clone(); }
        public boolean acknowledgedByEndpoint() { return status>=200 && status<300; }
        public boolean requiresReconciliation() { return status>=500; }
    }
    private static final int MAX_BYTES=131072;
    private final URI origin;
    private final String source,keyId;
    private final byte[] key;
    private final Clock clock;
    private final HttpClient http;
    public ReferralSourceClient(URI origin,String source,String keyId,byte[] key,Clock clock) {
        Objects.requireNonNull(origin); Objects.requireNonNull(key); this.clock=Objects.requireNonNull(clock);
        if(!"https".equals(origin.getScheme()) || origin.getHost()==null || origin.getUserInfo()!=null
            || origin.getQuery()!=null || origin.getFragment()!=null || !(origin.getPath().isEmpty() || origin.getPath().equals("/")))
            throw new IllegalArgumentException("An explicit HTTPS service origin is required");
        if(!List.of("auth","order","finance").contains(source) || !List.of("current","previous").contains(keyId) || key.length<32)
            throw new IllegalArgumentException("A registered source, key ID and strong source-specific key are required");
        this.origin=origin; this.source=source; this.keyId=keyId; this.key=key.clone();
        this.http=HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(5)).build();
    }
    public Prepared prepare(Endpoint endpoint,byte[] persistedJson) {
        Objects.requireNonNull(endpoint); Objects.requireNonNull(persistedJson);
        if(persistedJson.length==0 || persistedJson.length>MAX_BYTES) throw new IllegalArgumentException("Invalid source envelope size");
        if((endpoint==Endpoint.CLAIM || endpoint==Endpoint.ACK) && !source.equals("finance"))
            throw new IllegalArgumentException("Only finance can claim or acknowledge referral outbox events");
        String timestamp=Long.toString(clock.instant().getEpochSecond()); byte[] bytes=persistedJson.clone();
        return new Prepared(origin.resolve(endpoint.path()),Map.of("Content-Type","application/json","Accept","application/json",
            "X-Referral-Source",source,"X-Referral-Key-Id",keyId,"X-Referral-Timestamp",timestamp,
            "X-Referral-Signature",SourceSignatures.sign(key,source,keyId,timestamp,"POST",endpoint.path(),bytes)),bytes);
    }
    /** One attempt bounded by 128 KiB and a ten-second wall-clock deadline, including the body. */
    public Reply send(Endpoint endpoint,byte[] persistedJson) throws IOException,InterruptedException {
        Prepared prepared=prepare(endpoint,persistedJson);
        HttpRequest.Builder builder=HttpRequest.newBuilder(prepared.uri()).timeout(Duration.ofSeconds(10));
        prepared.headers().forEach(builder::header);
        HttpRequest request=builder.POST(HttpRequest.BodyPublishers.ofByteArray(prepared.body())).build();
        BoundedSourceBody body=new BoundedSourceBody(MAX_BYTES);
        var pending=http.sendAsync(request,info->body);
        try {
            HttpResponse<byte[]> response=pending.get(10,TimeUnit.SECONDS);
            return new Reply(response.statusCode(),response.body());
        } catch(TimeoutException ex) {
            body.abort(); pending.cancel(true); throw new IOException("REFERRAL_OUTCOME_UNCERTAIN_RECONCILE_ORIGINAL_ID",ex);
        } catch(ExecutionException ex) {
            body.abort(); pending.cancel(true); throw new IOException("REFERRAL_TRANSPORT_FAILED_RECONCILE_ORIGINAL_ID",ex.getCause());
        } catch(InterruptedException ex) {
            body.abort(); pending.cancel(true); throw ex;
        }
    }
    @Override public void close() { http.shutdownNow(); Arrays.fill(key,(byte)0); }
}
