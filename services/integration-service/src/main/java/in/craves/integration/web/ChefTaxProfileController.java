package in.craves.integration.web;

import in.craves.integration.finance.source.ChefTaxProfileService;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/finance/chefs/{chef}/tax-profile")
public class ChefTaxProfileController {
    public record Request(ChefTaxProfileService.Profile profile,String reason) {}
    private final ChefTaxProfileService service;
    public ChefTaxProfileController(ChefTaxProfileService service){this.service=service;}
    @GetMapping public ChefTaxProfileService.Version get(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef){return service.read(actor,chef);}
    @PostMapping public ChefTaxProfileService.Version save(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef,@RequestBody Request request){return service.save(actor,chef,request.profile(),request.reason());}
}
