package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChefTaxProfileBatchTest {
    record Row(UUID chef,UUID version,String payload) {}
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    final List<Row> rows=new ArrayList<>();
    final AtomicInteger queries=new AtomicInteger();
    final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    final ChefTaxProfileService profiles=new ChefTaxProfileService(jdbc,json);
    ChefTaxProfileBatchTest() {
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<Object>>any(),any(Object.class))).thenAnswer(invocation->{
            queries.incrementAndGet();String sql=invocation.getArgument(0);RowMapper<?> mapper=invocation.getArgument(1);
            boolean batch=sql.contains("LIMIT ?");
            if(batch)assertTrue(sql.contains("LEFT JOIN payment_schema.finance_chef_tax_version"));
            List<Row> selected=batch?rows.stream().limit((Integer)invocation.getArgument(2)).toList()
                :rows.stream().filter(row->row.chef().equals(invocation.getArgument(2))).toList();
            var result=new ArrayList<Object>();int index=0;
            for(Row row:selected){
                var rs=mock(ResultSet.class);
                when(rs.getObject(1,UUID.class)).thenReturn(batch?row.chef():row.version());
                if(batch)when(rs.getObject(2,UUID.class)).thenReturn(row.version());
                when(rs.getString(batch?3:2)).thenReturn(row.payload());
                result.add(mapper.mapRow(rs,index++));
            }
            return result;
        });
    }
    Row row(int number,LocalDate day,String turnover) throws Exception {
        int year=day.getMonthValue()<4?day.getYear()-1:day.getYear();
        var p=new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5","UNREGISTERED",null,turnover,
            year+"-"+String.format("%02d",(year+1)%100),day,"0","TEST-ONLY","TEST-ONLY","TEST-ONLY");
        return new Row(new UUID(1,number),new UUID(2,number),json.writeValueAsString(p));
    }
    @Test void oneJoinedQueryResolvesOneThousandHeads() throws Exception {
        LocalDate today=LocalDate.now(FinancePolicy.ZONE);
        for(int i=0;i<1000;i++)rows.add(row(i,today,"100.00"));
        var result=profiles.resolvedBatch(1000);
        assertTrue(result.complete());assertEquals(1000,result.versions().size());assertEquals(1,queries.get());
    }
    @Test void batchUsesExactSingleProfileDecodeReviewAndCurrentYearRules() throws Exception {
        LocalDate today=LocalDate.now(FinancePolicy.ZONE);
        rows.add(row(1,today,"100.00"));rows.add(row(2,today,"2000000.01"));rows.add(row(3,today.minusYears(1),"100.00"));
        var batch=profiles.resolvedBatch(1000);assertEquals(1,queries.get());assertTrue(batch.complete());
        assertEquals(List.of(profiles.resolved(rows.get(0).chef()),profiles.resolved(rows.get(1).chef())),batch.versions());
        assertEquals("REGISTRATION_REVIEW_REQUIRED",batch.versions().get(1).registrationReview());
        assertThrows(ResponseStatusException.class,()->profiles.resolved(rows.get(2).chef()));
        assertEquals(4,queries.get());
    }
    @Test void overflowIsIncompleteBeforeDecodeAndCorruptReferencesRemainFatal() {
        for(int i=0;i<1001;i++)rows.add(new Row(new UUID(1,i),new UUID(2,i),"invalid JSON"));
        var overflow=profiles.resolvedBatch(1000);assertFalse(overflow.complete());assertTrue(overflow.versions().isEmpty());assertEquals(1,queries.get());
        rows.clear();rows.add(new Row(UUID.randomUUID(),null,null));
        assertThrows(IllegalStateException.class,()->profiles.resolvedBatch(1000));
        rows.clear();rows.add(new Row(UUID.randomUUID(),UUID.randomUUID(),"invalid JSON"));
        assertThrows(IllegalStateException.class,()->profiles.resolvedBatch(1000));
        assertThrows(IllegalArgumentException.class,()->profiles.resolvedBatch(1001));
    }
}
