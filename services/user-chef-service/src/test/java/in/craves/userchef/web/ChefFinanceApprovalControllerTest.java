package in.craves.userchef.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChefFinanceApprovalControllerTest {
    final String key="SYNTHETIC_SHARED_CHEF_APPROVAL_KEY_20261005";
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    final ChefFinanceApprovalController controller=new ChefFinanceApprovalController(jdbc,json,key);
    MockHttpServletRequest request(String body,long delta) {
        var request=new MockHttpServletRequest();byte[] bytes=body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String time=Long.toString(Instant.now().getEpochSecond()+delta);request.setContent(bytes);
        request.addHeader(ChefFinanceApprovalProtocol.TIME,time);
        request.addHeader(ChefFinanceApprovalProtocol.SIGNATURE,ChefFinanceApprovalProtocol.sign(key,"POST",time,bytes));return request;
    }
    String body(){return "{\"requestId\":\""+UUID.randomUUID()+"\"}";}
    void rows(List<ChefFinanceApprovalController.Approval> rows) {
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),any(Object.class))).thenAnswer(i->{
            String sql=i.getArgument(0);assertTrue(sql.contains("WHERE status='APPROVED'"));
            assertFalse(sql.contains("finance_chef_tax"));assertEquals(1001,(Integer)i.getArgument(2));return rows;
        });
    }
    @Test void signedApprovedChefsAreReturnedWithoutTaxBankOrContactData()throws Exception {
        rows(List.of(new ChefFinanceApprovalController.Approval(UUID.randomUUID(),UUID.randomUUID(),"36",Instant.now().minusSeconds(60))));
        var response=controller.read(request(body(),0));assertEquals(200,response.getStatusCode().value());
        assertEquals("no-store, private",response.getHeaders().getFirst("Cache-Control"));
        String time=response.getHeaders().getFirst(ChefFinanceApprovalProtocol.TIME);
        assertTrue(ChefFinanceApprovalProtocol.matches(ChefFinanceApprovalProtocol.sign(key,"RESPONSE",time,response.getBody()),
            response.getHeaders().getFirst(ChefFinanceApprovalProtocol.SIGNATURE)));
        var node=json.readTree(response.getBody());assertTrue(node.path("complete").asBoolean());
        assertEquals(1,node.path("approvals").size());assertEquals(4,node.path("approvals").get(0).size());
        verify(jdbc,never()).update(anyString());
    }
    @Test void missingInvalidAndExpiredAuthenticationCannotReadTheDatabase() {
        var unsigned=new MockHttpServletRequest();unsigned.setContent(body().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(401,controller.read(unsigned).getStatusCode().value());
        for(long delta:new long[]{-16,16})assertEquals(401,controller.read(request(body(),delta)).getStatusCode().value());
        var changed=request(body(),0);changed.setContent("{}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(401,controller.read(changed).getStatusCode().value());
        assertEquals(503,new ChefFinanceApprovalController(jdbc,json,"").read(unsigned).getStatusCode().value());verifyNoInteractions(jdbc);
    }
    @Test void malformedDuplicateAndTrailingJsonCannotReadTheDatabase() {
        for(String value:List.of("{}","{\"requestId\":\"invalid\"}",body()+"{}",
                "{\"requestId\":\""+UUID.randomUUID()+"\",\"requestId\":\""+UUID.randomUUID()+"\"}"))
            assertEquals(400,controller.read(request(value,0)).getStatusCode().value());
        verifyNoInteractions(jdbc);
    }
    @Test void overflowIsCompleteFalseWithNoPartialList()throws Exception {
        rows(java.util.stream.IntStream.range(0,1001).mapToObj(i->new ChefFinanceApprovalController.Approval(
            new UUID(1,i),new UUID(2,i),"36",Instant.now().minusSeconds(60))).toList());
        var response=controller.read(request(body(),0));var node=json.readTree(response.getBody());
        assertFalse(node.path("complete").asBoolean());assertTrue(node.path("approvals").isEmpty());
    }
    @Test void sourceOutageRemainsUnavailableRatherThanAnEmptyApproval() {
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),any(Object.class)))
            .thenThrow(new IllegalStateException("Synthetic database outage"));
        assertEquals(503,controller.read(request(body(),0)).getStatusCode().value());
    }
    @Test void jurisdictionsAreMappedWithoutGuessing() {
        for(String state:List.of("Telangana"," TS ","36","TG"))assertEquals("36",ChefFinanceApprovalController.stateCode(state));
        for(String state:List.of("Andhra Pradesh","Hyderabad",""))assertEquals("UNSUPPORTED",ChefFinanceApprovalController.stateCode(state));
        assertEquals("UNSUPPORTED",ChefFinanceApprovalController.stateCode(null));
    }
}
