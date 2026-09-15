package in.craves.order.review;

import in.craves.order.exception.OrderApiException;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ReviewMediaConfiguration {
    @Bean
    @ConditionalOnMissingBean(ReviewMediaAuthorizer.class)
    ReviewMediaAuthorizer disabledReviewMediaAuthorizer() {
        return (principal, mediaAssetIds) -> {
            List<UUID> assets = mediaAssetIds == null ? List.of() : mediaAssetIds;
            if (!assets.isEmpty()) {
                throw OrderApiException.serviceUnavailable(
                    "REVIEW_MEDIA_AUTHORIZER_UNAVAILABLE",
                    "Review media cannot be attached until the approved media ownership integration is configured"
                );
            }
        };
    }
}
