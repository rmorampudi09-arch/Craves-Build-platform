package in.craves.advanced.menuoptions;

import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuote;
import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuoteRequest;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.security.InternalSecret;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * M24c slice A: order-service prices the dishes of a checkout with their M05 options at the order's own time (never the app's
 * {@code at}). Authenticated by the shared internal secret; not on the public gateway; answers like the module while it is off.
 * Stores nothing: order-service freezes what it was quoted.
 */
@RestController
public class MenuOptionsInternalController {
    /** One line per dish (a checkout holds each dish once); choiceIds may be empty for a dish without options. */
    public record CheckoutOptionsQuoteRequest(@NotNull Instant at, @NotNull @Size(min = 1, max = 50) List<@NotNull @Valid PriceQuoteRequest> lines) { }

    public record CheckoutOptionsQuote(Instant at, List<PriceQuote> lines, long totalPaise) { }

    private final MenuOptionsService service;
    private final ModuleRuntime runtime;
    private final Environment environment;

    public MenuOptionsInternalController(MenuOptionsService service, ModuleRuntime runtime, Environment environment) {
        this.service = service;
        this.runtime = runtime;
        this.environment = environment;
    }

    @PostMapping("/internal/v1/menu-options/checkout-quote")
    public ResponseEntity<CheckoutOptionsQuote> quoteCheckoutMenuOptions(@RequestHeader(value = InternalSecret.HEADER, required = false) String secret,
                                                                         @Valid @RequestBody CheckoutOptionsQuoteRequest request) {
        InternalSecret.require(environment, secret);
        runtime.ensureReady(runtime.moduleFor("/api/v1/advanced/menu-options").orElseThrow());
        if (request.lines().stream().map(PriceQuoteRequest::menuItemId).distinct().count() != request.lines().size()) {
            throw ApiProblem.badRequest("DUPLICATE_DISH", "Each dish may appear once");
        }
        List<PriceQuote> lines = service.checkoutQuote(request.at(), request.lines());
        long total = 0;
        for (PriceQuote line : lines) total = Math.addExact(total, line.totalPaise());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new CheckoutOptionsQuote(request.at(), lines, total));
    }
}
