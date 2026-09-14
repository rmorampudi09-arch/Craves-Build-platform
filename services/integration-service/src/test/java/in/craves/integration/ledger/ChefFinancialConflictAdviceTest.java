package in.craves.integration.ledger;

import in.craves.integration.web.ChefFinancialConflictAdvice;
import java.sql.SQLException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import static org.junit.jupiter.api.Assertions.*;

class ChefFinancialConflictAdviceTest {
    final ChefFinancialConflictAdvice advice=new ChefFinancialConflictAdvice();
    @Test void databaseGuardsBecomeSafeConflicts() {
        for(String state:List.of("23505","23514","55000","40001","40P01")) {
            var result=advice.financialConflict(new DataIntegrityViolationException("private SQL values",new SQLException("private account information",state)));
            assertEquals(409,result.getStatus());
            assertFalse(result.getDetail().contains("private"));
            assertEquals("FINANCIAL_STATE_CONFLICT",result.getProperties().get("code"));
        }
    }
    @Test void absentSqlStateDoesNotCauseAnotherFailure() {
        var result=advice.financialConflict(new DataIntegrityViolationException("private SQL",new SQLException("driver failure")));
        assertEquals(500,result.getStatus());assertFalse(result.getDetail().contains("private"));
    }
    @Test void unrelatedDatabaseFailureDoesNotBecomeFalseConflict() {
        var result=advice.financialConflict(new DataIntegrityViolationException("private SQL",new SQLException("network failure","08006")));
        assertEquals(500,result.getStatus());assertEquals("FINANCIAL_OPERATION_FAILED",result.getProperties().get("code"));
    }
}
