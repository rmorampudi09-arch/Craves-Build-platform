package in.craves.auth.web;

import in.craves.auth.config.JwtProperties;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Non-secret runtime capability used to prevent an incompatible web/backend rollout. */
@RestController
public class AdminSessionPolicyController {
    private final JwtProperties properties;
    public AdminSessionPolicyController(JwtProperties properties) { this.properties = properties; }

    @GetMapping("/api/v1/auth/session-policy")
    public ResponseEntity<?> policy() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
            "version", "ADMIN_SESSION_V1", "adminAbsoluteSeconds", 28800,
            "accessTokenSeconds", properties.getAccessTokenTtl().toSeconds()));
    }
}
