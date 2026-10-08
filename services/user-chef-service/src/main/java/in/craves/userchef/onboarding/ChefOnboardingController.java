package in.craves.userchef.onboarding;

import in.craves.userchef.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;

@RestController
@RequestMapping("/api/v1")
public class ChefOnboardingController {
    private final ChefOnboardingService service;
    private final ChefOnboardingContentService content;
    public ChefOnboardingController(ChefOnboardingService service,ChefOnboardingContentService content) {
        this.service=service; this.content=content;
    }
    @GetMapping("/chef/onboarding") State mine(@AuthenticationPrincipal CurrentUser user) { return service.mine(user); }
    @PutMapping("/chef/onboarding") State save(@AuthenticationPrincipal CurrentUser user,@RequestBody SaveRequest request) {
        return service.save(user,request);
    }
    @PostMapping("/chef/onboarding/submit") State submit(@AuthenticationPrincipal CurrentUser user,@RequestBody SubmitRequest request) {
        return service.submit(user,request.expectedVersion());
    }
    @PostMapping("/chef/onboarding/help") Help help(@AuthenticationPrincipal CurrentUser user,@RequestBody HelpRequest request) {
        return service.requestHelp(user,request);
    }
    @GetMapping("/chef/onboarding/content") List<Content> learning(@AuthenticationPrincipal CurrentUser user,@RequestParam String language) {
        return content.published(user,language);
    }
    @GetMapping("/chef/onboarding/content/{id}/playback") Playback playback(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id) {
        return content.playback(user,id,false);
    }
    @GetMapping("/backoffice/chef-onboarding/applications/{id}") State review(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id) {
        return service.review(user,id);
    }
    @GetMapping("/backoffice/chef-onboarding/help") HelpPage helpList(@AuthenticationPrincipal CurrentUser user,@RequestParam(required=false) String cursor) {
        return service.helpRequests(user,cursor);
    }
    @PutMapping("/backoffice/chef-onboarding/help/{id}") Help updateHelp(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id,@RequestBody HelpStatusRequest request) {
        return service.updateHelp(user,id,request);
    }
    @GetMapping("/backoffice/chef-onboarding/content") List<Content> contentList(@AuthenticationPrincipal CurrentUser user) {
        return content.list(user);
    }
    @PostMapping("/backoffice/chef-onboarding/content") UploadTicket create(@AuthenticationPrincipal CurrentUser user,@RequestBody ContentRequest request) {
        return content.create(user,request);
    }
    @PostMapping("/backoffice/chef-onboarding/content/{id}/finalize") Content finalizeUpload(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id) {
        return content.finalizeUpload(user,id);
    }
    @PutMapping("/backoffice/chef-onboarding/content/{id}/publication") Content publish(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id,@RequestBody PublishRequest request) {
        return content.publish(user,id,request);
    }
    @GetMapping("/backoffice/chef-onboarding/content/{id}/playback") Playback preview(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id) {
        return content.playback(user,id,true);
    }
    public record SubmitRequest(Long expectedVersion) {}
}
