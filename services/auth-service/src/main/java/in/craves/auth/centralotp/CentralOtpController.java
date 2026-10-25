package in.craves.auth.centralotp;

import in.craves.auth.exception.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth/otp")
@CrossOrigin(origins = {"https://craves.in", "https://www.craves.in"})
public class CentralOtpController {
    public record SendRequest(@NotNull @Pattern(regexp = "[6-9][0-9]{9}") String phoneNumber,
            @NotNull @Pattern(regexp = "91") String countryCode,
            @Pattern(regexp = "[A-Za-z0-9_-]{43}") String challengeId) {
        @Override public String toString() { return "SendRequest[redacted]"; }
    }
    public record VerifyRequest(@NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}") String challengeId,
            @NotNull @Pattern(regexp = "[0-9]{6}") String otp) {
        @Override public String toString() { return "VerifyRequest[redacted]"; }
    }
    public record Sent(String challengeId, long expiresAt, long resendAvailableAt) {
        @Override public String toString() { return "Sent[redacted]"; }
    }
    public record Verified(String firebaseCustomToken) {
        @Override public String toString() { return "Verified[redacted]"; }
    }
    private final CentralOtpStore store;
    private final CentralOtpProvider provider;
    private final CentralOtpIdentity identity;
    private final boolean enabled;

    public CentralOtpController(CentralOtpStore store, CentralOtpProvider provider, CentralOtpIdentity identity,
            @Value("${CRAVES_CENTRAL_OTP_ENABLED:false}") boolean enabled) {
        this.store = store; this.provider = provider; this.identity = identity; this.enabled = enabled;
    }

    @PostMapping("/send")
    public ResponseEntity<Sent> send(@Valid @RequestBody SendRequest request) {
        if (!enabled) { throw CentralOtpProvider.unavailable(); }
        var claim = store.send("+" + request.countryCode() + request.phoneNumber(), request.challengeId());
        try { provider.send(claim.phone()); }
        catch (AuthException failure) { store.finish(claim, "FAILED"); throw failure; }
        if (!store.finish(claim, "ACTIVE")) { throw CentralOtpStore.restart(); }
        return response(new Sent(claim.challenge(), claim.expiresAt(), claim.resendAt()));
    }

    @PostMapping("/verify")
    public ResponseEntity<Verified> verify(@Valid @RequestBody VerifyRequest request) {
        if (!enabled) { throw CentralOtpProvider.unavailable(); }
        var claim = store.verify(request.challengeId());
        try { provider.verify(claim.phone(), request.otp()); }
        catch (AuthException failure) {
            store.finish(claim, "OTP_INVALID".equals(failure.getCode()) ? "ACTIVE" : "FAILED");
            throw failure;
        }
        if (!store.finish(claim, "CONSUMED")) { throw CentralOtpStore.restart(); }
        return response(new Verified(identity.issue(claim.phone())));
    }

    private static <T> ResponseEntity<T> response(T value) {
        return ResponseEntity.ok().header("Cache-Control", "private, no-store").body(value);
    }
}
