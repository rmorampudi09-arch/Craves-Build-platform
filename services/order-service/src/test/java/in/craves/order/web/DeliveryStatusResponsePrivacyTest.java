package in.craves.order.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

class DeliveryStatusResponsePrivacyTest {
    @Test
    void customerResponseDoesNotExposeProviderTransactionOrRawPayload() {
        var componentNames = Arrays.stream(
            DeliveryStatusDtos.DeliveryStatusResponse.class.getRecordComponents()
        ).map(component -> component.getName()).toList();

        assertThat(componentNames)
            // deliveryCode is on purpose: the customer tells it to the Craves rider at the door.
            .contains("orderId", "deliveryJobId", "providerId", "status", "trackingUrl", "deliveryCode")
            .doesNotContain(
                "providerDeliveryId",
                "providerOrderId",
                "rawPayload",
                "payload",
                "signatureHash"
            );
    }

    @Test
    void noChefOrderDtoCarriesTheDeliveryCode() {
        // Chef (and customer order) reads are built from these holders through OrderService.mapOrder/mapChefOrder.
        var fields = List.of(ApiDtos.class, OrderHistoryDtos.class).stream()
            .flatMap(holder -> Arrays.stream(holder.getDeclaredClasses()))
            .filter(Class::isRecord)
            .flatMap(dto -> Arrays.stream(dto.getRecordComponents()))
            .map(component -> component.getName().toLowerCase(Locale.ROOT))
            .toList();

        assertThat(fields).isNotEmpty().noneMatch(name -> name.contains("deliverycode"));
    }
}
