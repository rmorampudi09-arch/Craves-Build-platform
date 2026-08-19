package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.support.SupportCaseStatus;
import in.craves.userchef.web.SupportCaseDtos.AddSupportMessageRequest;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCasePageResponse;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/support/cases")
public class SupportCaseController {
    private final SupportCaseService supportCaseService;

    public SupportCaseController(SupportCaseService supportCaseService) {
        this.supportCaseService = supportCaseService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SupportCaseDetailResponse create(
        @AuthenticationPrincipal CurrentUser user,
        @RequestBody CreateSupportCaseRequest request
    ) {
        return supportCaseService.create(user, request);
    }

    @GetMapping
    public SupportCasePageResponse list(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) SupportCaseStatus status
    ) {
        return supportCaseService.listMine(user, limit, cursor, status);
    }

    @GetMapping("/{caseId}")
    public SupportCaseDetailResponse get(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId
    ) {
        return supportCaseService.getMine(user, caseId);
    }

    @PostMapping("/{caseId}/messages")
    public SupportCaseDetailResponse addMessage(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId,
        @RequestBody AddSupportMessageRequest request
    ) {
        return supportCaseService.addRequesterMessage(user, caseId, request);
    }
}
