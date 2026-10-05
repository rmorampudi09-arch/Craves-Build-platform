package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChefFinanceApprovalSourceTest {
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    final String key="SYNTHETIC_SHARED_CHEF_APPROVAL_KEY_20261005";
    final Instant now=Instant.now(); final UUID request=UUID.randomUUID();
    final ChefFinanceApprovalSource source=new ChefFinanceApprovalSource(json,"https://source.invalid",key);
    ChefFinanceApprovalSource.Snapshot snapshot() {
        return new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of(new ChefFinanceApprovalSource.Approval(
            UUID.randomUUID(),UUID.randomUUID(),"36",now.minusSeconds(60))));
    }
    ChefFinanceApprovalSource.Snapshot verify(Object value)throws Exception {
        byte[] body=json.writeValueAsBytes(value);String time=Long.toString(now.getEpochSecond());
        return source.verify(request,body,time,ChefFinanceApprovalProtocol.sign(key,"RESPONSE",time,body),now);
    }
    @Test void acceptsFreshCompleteApprovalAndCompleteEmptyRevocation()throws Exception {
        var approved=snapshot();assertEquals(approved,verify(approved));
        assertTrue(verify(new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of())).approvals().isEmpty());
        assertFalse(verify(new ChefFinanceApprovalSource.Snapshot(request,now,false,List.of())).complete());
    }
    @Test void rejectsWrongKeyBodyRequestTimestampAndReplay()throws Exception {
        byte[] raw=json.writeValueAsBytes(snapshot());String time=Long.toString(now.getEpochSecond());
        String signed=ChefFinanceApprovalProtocol.sign(key,"RESPONSE",time,raw);
        assertThrows(IllegalStateException.class,()->source.verify(request,raw,time,"0".repeat(64),now));
        assertThrows(IllegalStateException.class,()->source.verify(UUID.randomUUID(),raw,time,signed,now));
        assertThrows(IllegalStateException.class,()->source.verify(request,raw,time,signed,now.plusSeconds(16)));
        assertThrows(IllegalStateException.class,()->source.verify(request,raw,time,signed,now.minusSeconds(6)));
        byte[] changed=json.writeValueAsBytes(new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of()));
        assertThrows(IllegalStateException.class,()->source.verify(request,changed,time,signed,now));
        assertThrows(IllegalStateException.class,()->source.verify(request,raw,time,ChefFinanceApprovalProtocol.sign(key,"POST",time,raw),now));
    }
    @Test void rejectsPartialDuplicateUnknownAndFutureApprovals()throws Exception {
        var value=snapshot();var approval=value.approvals().getFirst();
        assertThrows(IllegalStateException.class,()->verify(new ChefFinanceApprovalSource.Snapshot(request,now,false,value.approvals())));
        assertThrows(IllegalStateException.class,()->verify(new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of(approval,approval))));
        var extra=(ObjectNode)json.valueToTree(value);extra.put("email","private@example.test");
        assertThrows(IllegalStateException.class,()->verify(extra));
        assertThrows(IllegalStateException.class,()->verify(new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of(
            new ChefFinanceApprovalSource.Approval(approval.chefId(),approval.applicationId(),"UNKNOWN",now)))));
        assertThrows(IllegalStateException.class,()->verify(new ChefFinanceApprovalSource.Snapshot(request,now,true,List.of(
            new ChefFinanceApprovalSource.Approval(approval.chefId(),approval.applicationId(),"36",now.plusSeconds(6))))));
    }
    @Test void rejectsDuplicateJsonTrailingTokensAndWrongTypes()throws Exception {
        String valid=json.writeValueAsString(snapshot());String time=Long.toString(now.getEpochSecond());
        for(String value:List.of(valid+"{}",valid.replace("\"complete\":true","\"complete\":true,\"complete\":true"),
                valid.replace("\"complete\":true","\"complete\":\"true\""))) {
            byte[] bytes=value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            assertThrows(IllegalStateException.class,()->source.verify(request,bytes,time,
                ChefFinanceApprovalProtocol.sign(key,"RESPONSE",time,bytes),now));
        }
    }
    @Test void invalidConfigurationCannotMakeANetworkCall() {
        for(String origin:List.of("","http://source.invalid","https://source.invalid/path","https://user@source.invalid",
                "https://source.invalid?x=1","https://source.invalid#fragment"))
            assertThrows(IllegalStateException.class,()->new ChefFinanceApprovalSource(json,origin,key).current());
        assertThrows(IllegalStateException.class,()->new ChefFinanceApprovalSource(json,"https://source.invalid","").current());
    }
    @Test void boundsStreamBeforeAnUnboundedBodyAllocation() {
        var body=new ChefFinanceApprovalSource.BoundedBody();var subscription=mock(Flow.Subscription.class);
        body.onSubscribe(subscription);body.onNext(List.of(ByteBuffer.wrap(new byte[ChefFinanceApprovalProtocol.MAX_BYTES])));
        body.onNext(List.of(ByteBuffer.wrap(new byte[1])));org.mockito.Mockito.verify(subscription).cancel();
        assertTrue(body.getBody().toCompletableFuture().isCompletedExceptionally());
    }
}
