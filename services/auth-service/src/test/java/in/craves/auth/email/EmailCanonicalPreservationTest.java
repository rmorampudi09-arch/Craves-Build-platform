package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.google.firebase.auth.FirebaseToken;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.service.AuthService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class EmailCanonicalPreservationTest {
    @Test void firebasePhoneSignInDoesNotEraseOrReplaceVerifiedCanonicalEmail() {
        var identities=mock(AuthIdentityRepository.class);
        var identity=new AuthIdentity("synthetic-firebase","+10000000000");
        ReflectionTestUtils.setField(identity,"id",UUID.randomUUID());
        identity.setEmail("verified@example.test"); identity.setEmailVerified(true);
        when(identities.findByFirebaseUid("synthetic-firebase")).thenReturn(Optional.of(identity));
        when(identities.findByPhoneNumber("+10000000000")).thenReturn(Optional.of(identity));
        var token=mock(FirebaseToken.class); when(token.getUid()).thenReturn("synthetic-firebase");
        when(token.getEmail()).thenReturn(null,"other@example.test"); when(token.isEmailVerified()).thenReturn(false,true);
        var service=new AuthService(null,null,identities,null,null,null,null,null,null,null,null,null);
        for(int i=0;i<2;i++) {
            AuthIdentity result=ReflectionTestUtils.invokeMethod(service,"loadOrCreateIdentity",token,"+10000000000");
            assertEquals("verified@example.test",result.getEmail()); assertTrue(result.isEmailVerified());
        }
        verify(token,never()).getEmail(); verify(token,never()).isEmailVerified();
    }
    @Test void firebasePhoneIdentityCannotSelfGrantEmailVerification() {
        var identities=mock(AuthIdentityRepository.class);
        when(identities.findByFirebaseUid(anyString())).thenReturn(Optional.empty());
        when(identities.findByPhoneNumber(anyString())).thenReturn(Optional.empty());
        var token=mock(FirebaseToken.class); when(token.getUid()).thenReturn("synthetic-new");
        when(token.getEmail()).thenReturn("unrelated@example.test"); when(token.isEmailVerified()).thenReturn(true);
        var service=new AuthService(null,null,identities,null,null,null,null,null,null,null,null,null);
        AuthIdentity result=ReflectionTestUtils.invokeMethod(service,"loadOrCreateIdentity",token,"+10000000001");
        assertNull(result.getEmail()); assertFalse(result.isEmailVerified());
    }
}
