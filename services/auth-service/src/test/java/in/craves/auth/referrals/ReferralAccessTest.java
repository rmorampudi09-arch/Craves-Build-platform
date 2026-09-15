package in.craves.auth.referrals;

import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReferralAccessTest {
    AuthIdentityRepository identities=mock(AuthIdentityRepository.class);
    AuthIdentityRoleRepository roles=mock(AuthIdentityRoleRepository.class);
    ReferralAccessController controller=new ReferralAccessController(identities,roles);
    UUID id=UUID.randomUUID(); AuthIdentity identity=new AuthIdentity("TEST_UID","+919876543210");
    @BeforeEach void setup(){ReflectionTestUtils.setField(identity,"id",id);when(identities.findById(id)).thenReturn(Optional.of(identity));when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER"));}
    Authentication actor(long version,List<String> permissions){return UsernamePasswordAuthenticationToken.authenticated(new CurrentUser(id,"TEST_UID","",permissions,version),"",List.of());}
    @Test void activeAccountReturnsOnlyCurrentRolesAndNoCache(){
        var result=controller.access(actor(1,List.of("CUSTOMER","ADMIN")));
        assertEquals(List.of("CUSTOMER"),result.getBody().roles());assertEquals(id,result.getBody().userId());
        assertEquals("private, no-store",result.getHeaders().getFirst("Cache-Control"));
        assertEquals("Authorization",result.getHeaders().getFirst("Vary"));verify(identities,never()).save(any());
    }
    @Test void noPrincipalOrUnauthenticatedPrincipalIsRejected(){assertThrows(AuthException.class,()->controller.access(null));assertThrows(AuthException.class,()->controller.access(UsernamePasswordAuthenticationToken.unauthenticated(new CurrentUser(id,"","",List.of(),1),"")));}
    @Test void suspendedAndDeletedAccountsAreRejected(){identity.setStatus("SUSPENDED");assertThrows(AuthException.class,()->controller.access(actor(1,List.of())));when(identities.findById(id)).thenReturn(Optional.empty());assertThrows(AuthException.class,()->controller.access(actor(1,List.of())));}
    @Test void olderAndInventedFutureVersionsAreRejected(){identity.setTokenVersion(2);assertThrows(AuthException.class,()->controller.access(actor(1,List.of())));assertThrows(AuthException.class,()->controller.access(actor(3,List.of())));}
    @Test void newlyGrantedRoleIsNotAddedToOldToken(){when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER","ADMIN"));assertEquals(List.of("CUSTOMER"),controller.access(actor(1,List.of("CUSTOMER"))).getBody().roles());}
    @Test void accountChangesAreReadAgainOnEveryRequest(){controller.access(actor(1,List.of("CUSTOMER")));identity.setTokenVersion(2);assertThrows(AuthException.class,()->controller.access(actor(1,List.of("CUSTOMER"))));verify(identities,times(2)).findById(id);}
}
