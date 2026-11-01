package in.craves.advanced.partneroffers;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class PartnerOfferDtos {
    private PartnerOfferDtos() { }

    public enum PartnerOfferStatus { DRAFT, ACTIVE, PAUSED, ENDED }

    /** Everything is the partner's agreed wording; code is optional (some offers are just a link) and is shown only after a claim. */
    public record PartnerOfferDraft(@NotBlank @Size(max = 80) String partnerName,
                                    @NotBlank @Size(max = 120) String title,
                                    @NotBlank @Size(max = 1000) String description,
                                    @NotBlank @Size(max = 2000) String terms,
                                    @NotNull @Size(max = 500) @Pattern(regexp = "https://[^\\s]+") String linkUrl,
                                    @Pattern(regexp = "[A-Za-z0-9-]{3,40}") String code,
                                    @NotNull Instant startsAt,
                                    @NotNull Instant endsAt,
                                    @Min(1) @Max(10_000_000) Integer claimLimit,
                                    Long expectedVersion) { }

    public record PartnerOfferTransition(@NotNull Long expectedVersion) { }

    /** Staff view: includes the code and how many people claimed it (an aggregate, never who). */
    public record PartnerOfferAdminView(UUID id, String partnerName, String title, String description, String terms, String linkUrl,
                                        String code, Instant startsAt, Instant endsAt, Integer claimLimit, int claimedCount,
                                        PartnerOfferStatus status, long version, Instant createdAt, Instant updatedAt) { }

    /** What a customer sees after an order; the code stays hidden until they claim. */
    public record PartnerOfferCard(UUID id, String partnerName, String title, String description, String terms, Instant endsAt,
                                   boolean hasCode, boolean claimed) { }

    public record PartnerOfferClaimRequest(@NotNull UUID offerId) { }

    public record PartnerOfferClaimView(UUID offerId, String partnerName, String title, String terms, String linkUrl, String code,
                                        UUID orderId, Instant claimedAt, Instant endsAt) { }
}
