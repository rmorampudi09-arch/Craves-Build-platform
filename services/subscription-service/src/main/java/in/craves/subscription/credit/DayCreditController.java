package in.craves.subscription.credit;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.DayCreditChoiceRequest;
import in.craves.subscription.web.ApiDtos.DayCreditResponse;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/subscriptions")
public class DayCreditController {
    private static final Set<String> CHOICES = Set.of("REFUND", "EXTEND");

    private final DayCreditService service;

    public DayCreditController(DayCreditService service) {
        this.service = service;
    }

    @PostMapping("/{subscriptionId}/day-credits/{creditId}/choice")
    public DayCreditResponse choose(
        @PathVariable UUID subscriptionId,
        @PathVariable UUID creditId,
        @RequestBody DayCreditChoiceRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        String choice = request == null ? null : request.choice();
        if (choice == null || !CHOICES.contains(choice)) {
            throw ApiException.badRequest("INVALID_DAY_CREDIT_CHOICE", "Choose REFUND or EXTEND");
        }
        return service.choose(subscriptionId, creditId, choice, user);
    }
}
