package in.craves.catalog.dto;

import java.util.List;

public record SmartSearchFilterRequest(
    String query,
    List<String> cuisines,
    List<String> diets,
    List<String> occasions,
    Integer maxPrice,
    Integer maxDeliveryMinutes,
    String sortBy
) {}
