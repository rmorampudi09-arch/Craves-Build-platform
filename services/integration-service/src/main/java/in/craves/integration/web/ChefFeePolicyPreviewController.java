package in.craves.integration.web;

import in.craves.integration.pricing.ChefFeePreviewService;
import in.craves.integration.security.CravesPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ChefFeePolicyPreviewController {
    private final ChefFeePreviewService service;
    public ChefFeePolicyPreviewController(ChefFeePreviewService service) {this.service=service;}
    @PostMapping("/api/v1/admin/chef-fee-policies/preview")
    public ChefFeePreviewService.Response preview(@AuthenticationPrincipal CravesPrincipal principal,
        @RequestBody ChefFeePreviewService.Request request) {return service.preview(principal,request);}
}
