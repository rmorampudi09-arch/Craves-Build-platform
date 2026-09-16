package in.craves.referral;

import java.net.URI;
import java.util.Base64;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "referral")
public record ReferralSettings(boolean enabled, boolean workersEnabled, boolean awardsEnabled,
        boolean settlementEnabled, boolean withdrawalsEnabled, boolean spendingEnabled,
        String publicOrigin, String jwtIssuer, String jwtAudience, String verificationPemBase64,
        String authKey, String orderKey, String financeKey,
        String previousAuthKey, String previousOrderKey, String previousFinanceKey,
        long cashoutMinimumPaise, long annualKycThresholdPaise, long lifetimeReviewPaise,
        long reconciliationFreshnessSeconds) {
    public void requireEnabled() {
        if (!enabled) throw new ReferralProblem(503, "REFERRALS_DISABLED");
    }
    public String link(String code) {
        URI uri = URI.create(publicOrigin);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
            throw new IllegalStateException("Referral public origin must be an HTTPS origin");
        return publicOrigin.replaceAll("/$", "") + "/r/" + code;
    }
    public byte[] key(String source, String keyId) {
        String configured = switch (source + ":" + keyId) {
            case "auth:current" -> authKey;
            case "order:current" -> orderKey;
            case "finance:current" -> financeKey;
            case "auth:previous" -> previousAuthKey;
            case "order:previous" -> previousOrderKey;
            case "finance:previous" -> previousFinanceKey;
            default -> null;
        };
        try {
            byte[] key = Base64.getDecoder().decode(configured == null ? "" : configured);
            if (key.length < 32) throw new IllegalArgumentException();
            for(String other:List.of("auth","order","finance")) {
                if(other.equals(source)) continue;
                String[] candidates=switch(other) {
                    case "auth" -> new String[]{authKey,previousAuthKey};
                    case "order" -> new String[]{orderKey,previousOrderKey};
                    default -> new String[]{financeKey,previousFinanceKey};
                };
                for(String candidate:candidates) {
                    if(candidate==null || candidate.isBlank()) continue;
                    byte[] decoded;
                    try { decoded=Base64.getDecoder().decode(candidate); }
                    catch(IllegalArgumentException ex) { continue; }
                    if(MessageDigest.isEqual(key,decoded)) throw new ReferralProblem(503,"SOURCE_KEY_ISOLATION_REQUIRED");
                }
            }
            return key;
        } catch (IllegalArgumentException ex) { throw new ReferralProblem(401, "INVALID_SOURCE_SIGNATURE"); }
    }
}
