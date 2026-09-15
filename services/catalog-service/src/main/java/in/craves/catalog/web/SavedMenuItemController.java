package in.craves.catalog.web;

import in.craves.catalog.service.SavedMenuItemReadService;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsRequest;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/discovery/saved")
public class SavedMenuItemController {
    private final SavedMenuItemReadService savedMenuItemReadService;

    public SavedMenuItemController(SavedMenuItemReadService savedMenuItemReadService) {
        this.savedMenuItemReadService = savedMenuItemReadService;
    }

    @PostMapping("/menu-items/resolve")
    public ResponseEntity<ResolveSavedMenuItemsResponse> resolveSavedMenuItems(
        @RequestBody ResolveSavedMenuItemsRequest request
    ) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(savedMenuItemReadService.resolve(request));
    }
}
