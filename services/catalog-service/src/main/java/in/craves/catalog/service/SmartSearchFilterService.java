package in.craves.catalog.service;

import in.craves.catalog.dto.SmartSearchFilterRequest;
import in.craves.catalog.dto.SmartSearchFilterResponse;
import in.craves.catalog.entity.SmartSearchFilter;
import in.craves.catalog.repository.SmartSearchFilterRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class SmartSearchFilterService {

    private final SmartSearchFilterRepository repository;

    public SmartSearchFilterService(SmartSearchFilterRepository repository) {
        this.repository = repository;
    }

    public SmartSearchFilterResponse search(SmartSearchFilterRequest request) {
        List<SmartSearchFilterResponse.FacetGroup> facets = repository.findByActiveTrueOrderByCategoryAscLabelAsc()
            .stream()
            .collect(Collectors.groupingBy(SmartSearchFilter::getCategory))
            .entrySet()
            .stream()
            .sorted(Map.Entry.comparingByKey())
            .map(entry -> new SmartSearchFilterResponse.FacetGroup(
                entry.getKey(),
                entry.getValue().stream()
                    .map(filter -> new SmartSearchFilterResponse.FacetOption(filter.getCode(), filter.getLabel()))
                    .toList()
            ))
            .toList();

        List<SmartSearchFilterResponse.SearchResult> results = List.of(
            new SmartSearchFilterResponse.SearchResult("k-101", "Amma Vantillu", "Hyderabadi Chicken Biryani", "Hyderabadi", "NON_VEG", 219, 32),
            new SmartSearchFilterResponse.SearchResult("k-205", "Sattvic Soul Kitchen", "Millet Power Bowl", "Healthy", "VEG", 189, 24),
            new SmartSearchFilterResponse.SearchResult("k-310", "Party Parcel Co.", "Family Andhra Meals Tray", "Andhra", "VEG", 699, 55)
        ).stream()
            .filter(result -> request.query() == null || result.dishName().toLowerCase().contains(request.query().toLowerCase()) || result.cuisine().toLowerCase().contains(request.query().toLowerCase()))
            .filter(result -> request.maxPrice() == null || result.price() <= request.maxPrice())
            .filter(result -> request.maxDeliveryMinutes() == null || result.etaMinutes() <= request.maxDeliveryMinutes())
            .sorted(Comparator.comparingInt(SmartSearchFilterResponse.SearchResult::etaMinutes))
            .toList();

        return new SmartSearchFilterResponse(request.query(), facets, results);
    }
}
