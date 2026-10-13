package in.craves.auth.centralotp;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class CentralOtpIdentity {
    private final AuthIdentityRepository identities;
    private final FirebaseAuth firebase;

    @Autowired
    public CentralOtpIdentity(AuthIdentityRepository identities, FirebaseApp app) {
        this(identities, FirebaseAuth.getInstance(app));
    }

    CentralOtpIdentity(AuthIdentityRepository identities, FirebaseAuth firebase) {
        this.identities = identities;
        this.firebase = firebase;
    }

    // Package-private: only the consumed server challenge can reach this identity bridge.
    String issue(String verifiedPhone) {
        var identity = identities.findByPhoneNumber(verifiedPhone);
        if (identity.isPresent() && !"ACTIVE".equals(identity.get().getStatus())) {
            throw AuthException.forbidden("IDENTITY_INACTIVE", "This account is not available");
        }
        try {
            UserRecord user;
            try { user = firebase.getUserByPhoneNumber(verifiedPhone); }
            catch (FirebaseAuthException missing) {
                if (missing.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND || identity.isPresent()) {
                    throw missing;
                }
                try { user = firebase.createUser(new UserRecord.CreateRequest().setPhoneNumber(verifiedPhone)); }
                catch (FirebaseAuthException race) {
                    if (race.getAuthErrorCode() != AuthErrorCode.PHONE_NUMBER_ALREADY_EXISTS) { throw race; }
                    user = firebase.getUserByPhoneNumber(verifiedPhone);
                }
            }
            if (user.isDisabled() || !verifiedPhone.equals(user.getPhoneNumber())) {
                throw AuthException.forbidden("IDENTITY_INACTIVE", "This account is not available");
            }
            if (identity.isPresent() && !identity.get().getFirebaseUid().equals(user.getUid())) {
                throw AuthException.conflict("PHONE_IDENTITY_MISMATCH", "This phone cannot be linked automatically");
            }
            return firebase.createCustomToken(user.getUid());
        } catch (FirebaseAuthException exception) {
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "OTP_IDENTITY_UNAVAILABLE",
                    "Sign-in is temporarily unavailable");
        }
    }
}
