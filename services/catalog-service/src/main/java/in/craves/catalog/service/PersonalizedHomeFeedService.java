package in.craves.catalog.service;

import in.craves.catalog.dto.PersonalizedHomeFeedResponse;
import in.craves.catalog.repository.PersonalizedHomeFeedRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class PersonalizedHomeFeedService {
    private final PersonalizedHomeFeedRepository repository;
    public PersonalizedHomeFeedService(PersonalizedHomeFeedRepository repository) { this.repository = repository; }

    public PersonalizedHomeFeedResponse getFeed(UUID customerId) {
        List<PersonalizedHomeFeedResponse.Rail> rails = repository.findByCustomerIdOrderByRankOrderAsc(customerId)
            .stream()
            .collect(Collectors.groupingBy(feed -> feed.getRailTitle(), Collectors.mapping(feed -> feed.getItemTitle(), Collectors.toList())))
            .entrySet()
            .stream()
            .map(entry -> new PersonalizedHomeFeedResponse.Rail(entry.getKey(), entry.getValue()))
            .toList();

        if (!rails.isEmpty()) {
            return new PersonalizedHomeFeedResponse(rails);
        }

        return new PersonalizedHomeFeedResponse(List.of(
            new PersonalizedHomeFeedResponse.Rail("Order again", List.of("Andhra Chicken Curry Combo", "Millet Lunch Bowl")),
            new PersonalizedHomeFeedResponse.Rail("Because you love homely meals", List.of("Pappu & Rice Box", "Paneer Curry Family Pack")),
            new PersonalizedHomeFeedResponse.Rail("Fast prep near you", List.of("Quick Veg Thali", "Egg Fried Rice"))
        ));
    }
}
