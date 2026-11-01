package in.craves.advanced.savedfeed;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedFeedView;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The caller's Saved tab in one read; every source is read with the caller's own token. */
@RestController
@RequestMapping("/api/v1/advanced/saved-feed")
public class SavedFeedController {
    private final SavedFeedService service;

    public SavedFeedController(SavedFeedService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<SavedFeedView> savedFeed() {
        CurrentUser.id();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.feed(CurrentUser.bearerToken()));
    }
}
