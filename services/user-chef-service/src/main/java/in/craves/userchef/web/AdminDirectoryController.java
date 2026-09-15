package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.AdminDirectoryService;
import in.craves.userchef.web.AdminDirectoryDtos.ChefCaseResponse;
import in.craves.userchef.web.AdminDirectoryDtos.CustomerCaseResponse;
import in.craves.userchef.web.AdminDirectoryDtos.DirectorySearchRequest;
import in.craves.userchef.web.AdminDirectoryDtos.DirectorySearchResponse;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/directory")
public class AdminDirectoryController {
    private final AdminDirectoryService service;

    public AdminDirectoryController(AdminDirectoryService service) {
        this.service = service;
    }

    @PostMapping("/search")
    public ResponseEntity<DirectorySearchResponse> search(
        @AuthenticationPrincipal CurrentUser user,
        @RequestBody DirectorySearchRequest request,
        @RequestHeader("X-Admin-Reason") String reason
    ) {
        DirectorySearchResponse response = service.search(user, request == null ? null : request.query(), reason);
        return noStore(response, response.correlationId());
    }

    @GetMapping("/customers/{identityId}")
    public ResponseEntity<CustomerCaseResponse> customerCase(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID identityId,
        @RequestHeader("X-Admin-Reason") String reason
    ) {
        CustomerCaseResponse response = service.getCustomerCase(user, identityId, reason);
        return noStore(response, response.correlationId());
    }

    @GetMapping("/chefs/{identityId}")
    public ResponseEntity<ChefCaseResponse> chefCase(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID identityId,
        @RequestHeader("X-Admin-Reason") String reason
    ) {
        ChefCaseResponse response = service.getChefCase(user, identityId, reason);
        return noStore(response, response.correlationId());
    }

    private static <T> ResponseEntity<T> noStore(T body, UUID correlationId) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(body);
    }
}
