package in.craves.userchef.dto;

import java.util.List;

public record ChefTrustBadgeResponse(List<Badge> badges) {
    public record Badge(String code, String label, String description) {}
}
