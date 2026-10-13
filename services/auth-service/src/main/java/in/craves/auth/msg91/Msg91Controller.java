package in.craves.auth.msg91;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Msg91Controller {
    private final Msg91FirebaseBridge bridge;
    public Msg91Controller(Msg91FirebaseBridge bridge) { this.bridge = bridge; }
    public record VerifyRequest(@NotBlank @Size(min=40, max=20000) String accessToken) {
        @Override public String toString() { return "VerifyRequest[redacted]"; }
    }
    public record VerifyResponse(String firebaseCustomToken) {
        @Override public String toString() { return "VerifyResponse[redacted]"; }
    }
    @PostMapping("/api/v1/auth/msg91/verify")
    public ResponseEntity<VerifyResponse> verify(@Valid @RequestBody VerifyRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(new VerifyResponse(bridge.exchange(request.accessToken())));
    }
}
