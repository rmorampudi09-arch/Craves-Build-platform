package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.RepeatOrderService;
import in.craves.order.web.RepeatOrderDtos.RepeatOrderPage;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/repeat-candidates")
public class RepeatOrderController {
    private final RepeatOrderService service;

    public RepeatOrderController(RepeatOrderService service) {
        this.service = service;
    }

    @GetMapping
    public RepeatOrderPage list(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return service.listCandidates(principal, limit, cursor);
    }
}
