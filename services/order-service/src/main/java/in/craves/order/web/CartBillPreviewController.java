package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CartBillPreviewService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CartBillPreviewController {
    private final CartBillPreviewService previews;
    public CartBillPreviewController(CartBillPreviewService previews) { this.previews = previews; }

    @PostMapping("/api/v1/cart/bill-preview")
    public ResponseEntity<CartBillPreviewService.Response> preview(@AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody CartBillPreviewService.Request request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(previews.preview(principal, request));
    }
}
