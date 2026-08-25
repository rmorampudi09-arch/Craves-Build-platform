package in.craves.catalog.dto;

import java.util.List;

public record PersonalizedHomeFeedResponse(List<Rail> rails) {
    public record Rail(String title, List<String> items) {}
}
