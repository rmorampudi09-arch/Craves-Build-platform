package in.craves.advanced.personalized;

import in.craves.advanced.personalized.PersonalizedDtos.RankRequest;
import in.craves.advanced.personalized.PersonalizedDtos.RankResult;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only: POST only because the candidate list goes in the body. Nothing is stored. */
@RestController
@RequestMapping("/api/v1/advanced/personalized")
public class PersonalizedController {
    private final PersonalizedService service;

    public PersonalizedController(PersonalizedService service) {
        this.service = service;
    }

    @PostMapping("/rank")
    public ResponseEntity<RankResult> rankPersonalized(@Valid @RequestBody RankRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.rank(CurrentUser.id(), CurrentUser.bearerToken(), request.items()));
    }
}
