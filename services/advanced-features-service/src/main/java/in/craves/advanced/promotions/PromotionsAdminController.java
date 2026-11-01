package in.craves.advanced.promotions;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.promotions.PromotionsDtos.AdminPromotion;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.promotions.PromotionsDtos.PromotionChange;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemption;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemptionPage;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemptionVoid;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff set every commercial value of a promotion; support and audit staff can read them and their redemptions. */
@RestController
@RequestMapping("/api/v1/advanced/promotions/admin")
public class PromotionsAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final PromotionsService service;

    public PromotionsAdminController(PromotionsService service) {
        this.service = service;
    }

    @GetMapping("/promotions")
    public ResponseEntity<List<AdminPromotion>> listPromotions() {
        CurrentUser.requireAnyRole(READERS);
        return PromotionsController.ok(service.adminPromotions());
    }

    @PostMapping("/promotions")
    public ResponseEntity<AdminPromotion> createPromotion(@Valid @RequestBody NewPromotion request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.createPromotion(staff, request));
    }

    @PutMapping("/promotions/{promotionId}")
    public ResponseEntity<AdminPromotion> updatePromotion(@PathVariable UUID promotionId, @Valid @RequestBody PromotionChange change) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return PromotionsController.ok(service.updatePromotion(staff, promotionId, change));
    }

    @GetMapping("/promotions/{promotionId}/redemptions")
    public ResponseEntity<PromotionRedemptionPage> promotionRedemptions(@PathVariable UUID promotionId,
                                                                        @RequestParam(value = "cursor", required = false) String cursor,
                                                                        @RequestParam(value = "limit", required = false) Integer limit) {
        CurrentUser.requireAnyRole(READERS);
        return PromotionsController.ok(service.redemptions(promotionId, cursor, Cursor.limit(limit, 50, 200)));
    }

    @PostMapping("/redemptions/{redemptionId}/void")
    public ResponseEntity<PromotionRedemption> voidPromotionRedemption(@PathVariable UUID redemptionId,
                                                                       @Valid @RequestBody PromotionRedemptionVoid request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return PromotionsController.ok(service.voidRedemption(staff, redemptionId, request.reason()));
    }
}
