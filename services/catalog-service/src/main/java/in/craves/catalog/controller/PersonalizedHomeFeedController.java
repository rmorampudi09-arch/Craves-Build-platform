package in.craves.catalog.controller;

import in.craves.catalog.dto.PersonalizedHomeFeedResponse;
import in.craves.catalog.service.PersonalizedHomeFeedService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/discovery/personalized")
public class PersonalizedHomeFeedController {
    private final PersonalizedHomeFeedService service;
    public PersonalizedHomeFeedController(PersonalizedHomeFeedService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<PersonalizedHomeFeedResponse> get(@RequestParam UUID customerId) {
        return ResponseEntity.ok(service.getFeed(customerId));
    }
}
