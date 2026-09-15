package in.craves.order.referrals;
import com.fasterxml.jackson.databind.JsonNode;
import in.craves.order.service.PaymentCallbackService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralBenefitPaymentController {
    private final ReferralCheckoutBenefits benefits;private final PaymentCallbackService payments;private final String key;
    public ReferralBenefitPaymentController(ReferralCheckoutBenefits benefits,PaymentCallbackService payments,@Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String key){this.benefits=benefits;this.payments=payments;this.key=key;}
    @PostMapping("/internal/v1/payments/checkout/{id}/referral-paid")
    public JsonNode paid(@PathVariable UUID id,@RequestHeader(name="X-Craves-Internal-Secret",required=false) String supplied){
        if(key.isBlank() || supplied==null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if("NONE".equals(benefits.read(id).path("state").asText()))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if(!benefits.requestConsumption(id))throw ReferralCheckoutBenefits.conflict("Referral funding is pending");
        payments.markCheckoutPaid(id,null,"Verified referral checkout funding");return benefits.read(id);
    }
    @PostMapping("/internal/v1/payments/checkout/{id}/referral-release")
    public JsonNode release(@PathVariable UUID id,@RequestHeader(name="X-Craves-Internal-Secret",required=false) String supplied){
        if(key.isBlank() || supplied==null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        benefits.requestRelease(id);return benefits.read(id);
    }

}
