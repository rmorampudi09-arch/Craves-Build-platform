package in.craves.supportassistant.web;

import in.craves.supportassistant.observability.RequestCorrelationFilter;
import in.craves.supportassistant.security.CurrentUser;
import in.craves.supportassistant.service.SupportAssistantService;
import in.craves.supportassistant.web.SupportDtos.AskRequest;
import in.craves.supportassistant.web.SupportDtos.AskResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/support-assistant")
public class SupportAssistantController {
    private final SupportAssistantService supportAssistantService;

    public SupportAssistantController(SupportAssistantService supportAssistantService) {
        this.supportAssistantService = supportAssistantService;
    }

    @PostMapping("/ask")
    public AskResponse ask(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody AskRequest request,
        @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
        HttpServletRequest servletRequest
    ) {
        return supportAssistantService.ask(
            user,
            request,
            authorization,
            RequestCorrelationFilter.current(servletRequest)
        );
    }
}
