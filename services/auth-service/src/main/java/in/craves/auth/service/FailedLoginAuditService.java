package in.craves.auth.service;

import in.craves.auth.domain.LoginAttempt;
import in.craves.auth.repository.LoginAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Failure-only audit boundary; successful attempts stay atomic with identity/session creation. */
@Service
public class FailedLoginAuditService {
    private final LoginAttemptRepository loginAttempts;

    public FailedLoginAuditService(LoginAttemptRepository loginAttempts) {
        this.loginAttempts = loginAttempts;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String firebaseUid, String failureCode, String ipAddress, String userAgent) {
        loginAttempts.save(new LoginAttempt(firebaseUid, null, false, failureCode, ipAddress, userAgent));
    }
}
