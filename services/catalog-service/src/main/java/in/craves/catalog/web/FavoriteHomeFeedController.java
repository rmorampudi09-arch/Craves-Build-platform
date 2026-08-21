package in.craves.catalog.web;

import in.craves.catalog.service.FavoriteHomeFeedService;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/discovery/favorites/home")
public class FavoriteHomeFeedController {
    private final FavoriteHomeFeedService service;

    public FavoriteHomeFeedController(FavoriteHomeFeedService service) {
        this.service = service;
    }

    @PostMapping("/resolve")
    public ResolveFavoriteHomeResponse resolve(@RequestBody ResolveFavoriteHomeRequest request) {
        return service.resolve(request);
    }
}
