package in.craves.auth.msg91;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class Msg91FirebaseBridgeTest {
    Msg91Verifier verifier = mock(Msg91Verifier.class);
    Msg91TokenConsumption consumption = mock(Msg91TokenConsumption.class);
    AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    FirebaseAuth firebase = mock(FirebaseAuth.class);
    Msg91FirebaseBridge bridge = new Msg91FirebaseBridge(verifier, consumption, identities, firebase);
    String phone = "+919876543210";
    UserRecord user = mock(UserRecord.class);

    @BeforeEach void setup() throws Exception {
        when(verifier.verifiedPhone("verified-token")).thenReturn(phone);
        when(identities.findByPhoneNumber(phone)).thenReturn(Optional.of(new AuthIdentity("existing-uid", phone)));
        when(firebase.getUserByPhoneNumber(phone)).thenReturn(user);
        when(user.getUid()).thenReturn("existing-uid");
        when(user.getPhoneNumber()).thenReturn(phone);
        when(firebase.createCustomToken("existing-uid")).thenReturn("custom-token");
    }
    @Test void preservesExistingUidWithoutWritingIdentityOrRole() throws Exception {
        assertEquals("custom-token", bridge.exchange("verified-token"));
        verify(identities).findByPhoneNumber(phone);
        verifyNoMoreInteractions(identities);
        var order = inOrder(verifier, consumption, firebase);
        order.verify(verifier).verifiedPhone("verified-token");
        order.verify(consumption).consume("verified-token");
        order.verify(firebase).getUserByPhoneNumber(phone);
        order.verify(firebase).createCustomToken("existing-uid");
        verify(firebase, never()).createUser(any());
    }
    @Test void unverifiedResultNeverSelectsAnIdentity() {
        when(verifier.verifiedPhone(any())).thenThrow(AuthException.unauthorized("INVALID", "Invalid"));
        assertThrows(AuthException.class, () -> bridge.exchange("forged-token"));
        verifyNoInteractions(identities, consumption, firebase);
    }
    @Test void replayCannotMintAnotherFirebaseToken() {
        doThrow(AuthException.unauthorized("OTP_ALREADY_USED", "Used")).when(consumption).consume(any());
        assertThrows(AuthException.class, () -> bridge.exchange("verified-token"));
        verifyNoInteractions(firebase);
    }
    @Test void accountMismatchCannotRelinkOrMint() throws Exception {
        when(user.getUid()).thenReturn("different-uid");
        var error = assertThrows(AuthException.class, () -> bridge.exchange("verified-token"));
        assertEquals("PHONE_IDENTITY_MISMATCH", error.getCode());
        verify(firebase, never()).createCustomToken(anyString());
        verify(firebase, never()).updateUser(any());
    }
    @Test void suspendedCravesAccountCannotMint() {
        var identity = new AuthIdentity("existing-uid", phone); identity.setStatus("SUSPENDED");
        when(identities.findByPhoneNumber(phone)).thenReturn(Optional.of(identity));
        assertThrows(AuthException.class, () -> bridge.exchange("verified-token"));
        verifyNoInteractions(firebase, consumption);
    }
    @Test void disabledFirebaseAccountCannotMint() throws Exception {
        when(user.isDisabled()).thenReturn(true);
        assertThrows(AuthException.class, () -> bridge.exchange("verified-token"));
        verify(firebase, never()).createCustomToken(anyString());
    }
}
