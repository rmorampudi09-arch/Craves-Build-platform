package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.support.SupportCaseStatus;
import in.craves.userchef.web.SupportCaseDtos.AddBackofficeSupportMessageRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCasePageResponse;
import in.craves.userchef.web.SupportCaseDtos.UpdateSupportCaseStatusRequest;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/support/cases")
public class AdminSupportCaseController {
    private final SupportCaseService supportCaseService;

    public AdminSupportCaseController(SupportCaseService supportCaseService) {
        this.supportCaseService = supportCaseService;
    }

    @GetMapping
    public SupportCasePageResponse list(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) SupportCaseStatus status,
        @RequestParam(defaultValue = "false") boolean assignedToMe
    ) {
        return supportCaseService.listBackoffice(user, limit, cursor, status, assignedToMe);
    }

    @GetMapping("/{caseId}")
    public SupportCaseDetailResponse get(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId
    ) {
        return supportCaseService.getBackoffice(user, caseId);
    }

    @PostMapping("/{caseId}/messages")
    public SupportCaseDetailResponse addMessage(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId,
        @RequestBody AddBackofficeSupportMessageRequest request
    ) {
        return supportCaseService.addBackofficeMessage(user, caseId, request);
    }

    @PatchMapping("/{caseId}/status")
    public SupportCaseDetailResponse updateStatus(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId,
        @RequestBody UpdateSupportCaseStatusRequest request
    ) {
        return supportCaseService.updateStatus(user, caseId, request);
    }

    @PostMapping("/{caseId}/assign-to-me")
    public SupportCaseDetailResponse assignToMe(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID caseId
    ) {
        return supportCaseService.assignToMe(user, caseId);
    }
}
