package in.craves.supportassistant.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class SupportDtos {
    private SupportDtos() {}

    public enum Audience {
        CUSTOMER,
        CHEF
    }

    public record AskRequest(
        @NotBlank @Size(max = 2000) String message,
        @NotNull Audience audience,
        UUID orderId,
        UUID supportCaseId
    ) {}

    public record SourceReference(String title, String sourceType, String sourceRef) {}

    public record ContextSummary(
        UUID orderId,
        String orderStatus,
        String kitchenName,
        Integer prepTimeMinutes,
        UUID supportCaseId,
        String supportCaseStatus
    ) {}

    public record AskResponse(
        String answer,
        boolean aiUsed,
        boolean escalationSuggested,
        List<SourceReference> sources,
        ContextSummary context,
        String correlationId
    ) {
        public AskResponse {
            sources = sources == null ? List.of() : List.copyOf(sources);
        }
    }
}
