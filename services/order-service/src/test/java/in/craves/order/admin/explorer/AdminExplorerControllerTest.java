package in.craves.order.admin.explorer;
import in.craves.order.security.CravesPrincipal;
import in.craves.adminexplorer.ExplorerQueryTest;
import in.craves.adminexplorer.ExplorerQuery;
import in.craves.adminexplorer.ExplorerEngine;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AdminExplorerControllerTest {
 Authentication actor(String role){Authentication a=mock(Authentication.class);when(a.isAuthenticated()).thenReturn(true);when(a.getPrincipal()).thenReturn(new CravesPrincipal(UUID.randomUUID(),"+919999999999",Set.of(role)));return a;}
 @Test void rejectsUnauthenticatedBeforeAnyDatabaseWork(){var e=mock(ExplorerEngine.class);var c=new AdminExplorerController(e,true);assertEquals(401,c.query(null,ExplorerQueryTest.normal()).getStatusCode().value());verifyNoInteractions(e);}
 @Test void rejectsCustomerChefAndLegacyAdmin(){for(String role:List.of("CUSTOMER","CHEF","ADMIN","SUPPORT_ADMIN")){var e=mock(ExplorerEngine.class);assertEquals(403,new AdminExplorerController(e,true).query(actor(role),ExplorerQueryTest.normal()).getStatusCode().value());verifyNoInteractions(e);}}
 @Test void disabledByDefaultEvenForPlatformAdmin(){var e=mock(ExplorerEngine.class);assertEquals(503,new AdminExplorerController(e,false).query(actor("PLATFORM_ADMIN"),ExplorerQueryTest.normal()).getStatusCode().value());verifyNoInteractions(e);}
 @Test void invalidReasonNeverReachesDatabase(){var e=mock(ExplorerEngine.class);var q=ExplorerQueryTest.request("","","","","",25,"newest","records",null,null,"");assertEquals(400,new AdminExplorerController(e,true).query(actor("AUDIT_ADMIN"),q).getStatusCode().value());verifyNoInteractions(e);}
 @Test void databaseFailureNeverReturnsPartialRows(){var e=mock(ExplorerEngine.class);when(e.read(any(),any())).thenThrow(new IllegalStateException("secret-database-value"));var response=new AdminExplorerController(e,true).query(actor("PLATFORM_ADMIN"),ExplorerQueryTest.normal());assertEquals(503,response.getStatusCode().value());assertFalse(response.getBody().toString().contains("secret-database-value"));assertEquals("no-store",response.getHeaders().getCacheControl());}
}
