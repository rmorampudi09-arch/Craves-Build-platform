package in.craves.auth.msg91;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class Msg91FirebaseBridge {
    private final Msg91Verifier verifier;
    private final Msg91TokenConsumption consumption;
    private final AuthIdentityRepository identities;
    private final FirebaseAuth firebase;

    @Autowired
    public Msg91FirebaseBridge(Msg91Verifier verifier, Msg91TokenConsumption consumption,
                              AuthIdentityRepository identities, FirebaseApp app) {
        this(verifier, consumption, identities, FirebaseAuth.getInstance(app));
    }
    Msg91FirebaseBridge(Msg91Verifier verifier, Msg91TokenConsumption consumption,
                        AuthIdentityRepository identities, FirebaseAuth firebase) {
        this.verifier = verifier; this.consumption = consumption;
        this.identities = identities; this.firebase = firebase;
    }

    public String exchange(String accessToken) {
        String phone = verifier.verifiedPhone(accessToken);
        var identity = identities.findByPhoneNumber(phone);
        if (identity.isPresent() && !"ACTIVE".equals(identity.get().getStatus()))
            throw AuthException.forbidden("IDENTITY_INACTIVE", "This account is not available");
        // Commit independently before Firebase operations; errors require a fresh OTP.
        consumption.consume(accessToken);
        try {
            UserRecord user;
            try { user = firebase.getUserByPhoneNumber(phone); }
            catch (FirebaseAuthException missing) {
                if (missing.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND || identity.isPresent()) throw missing;
                try { user = firebase.createUser(new UserRecord.CreateRequest().setPhoneNumber(phone)); }
                catch (FirebaseAuthException race) {
                    if (race.getAuthErrorCode() != AuthErrorCode.PHONE_NUMBER_ALREADY_EXISTS) throw race;
                    user = firebase.getUserByPhoneNumber(phone);
                }
            }
            if (user.isDisabled() || !phone.equals(user.getPhoneNumber()))
                throw AuthException.forbidden("IDENTITY_INACTIVE", "This account is not available");
            if (identity.isPresent() && !identity.get().getFirebaseUid().equals(user.getUid()))
                throw AuthException.conflict("PHONE_IDENTITY_MISMATCH", "This phone cannot be linked automatically");
            // Keep Firebase UID, email, Craves roles, referrals, and existing session exchange intact.
            return firebase.createCustomToken(user.getUid());
        } catch (FirebaseAuthException ex) {
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "OTP_IDENTITY_UNAVAILABLE", "Sign-in is temporarily unavailable");
        }
    }
}
