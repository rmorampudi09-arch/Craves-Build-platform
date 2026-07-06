package in.craves.auth.controller;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    @PostMapping("/firebase/exchange")
    public ResponseEntity<Map<String, Object>> exchange(@RequestBody Map<String, String> request) throws Exception {
        String firebaseIdToken = request.get("firebaseIdToken");
        FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(firebaseIdToken, true);
        return ResponseEntity.ok(Map.of(
            "userId", UUID.nameUUIDFromBytes(decoded.getUid().getBytes()).toString(),
            "phoneNumber", decoded.getClaims().getOrDefault("phone_number", ""),
            "roles", java.util.List.of("CUSTOMER"),
            "status", "ACTIVE",
            "message", "Firebase phone verification accepted. Full Craves JWT/session persistence is the next hardening patch."
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        return ResponseEntity.ok(Map.of("service", "craves-auth-service", "status", "running"));
    }
}
