package in.craves.integration.admin;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.admin.AdminIntegrationInvestigationController.ProofOfDeliverySnapshot;
import in.craves.integration.admin.AdminIntegrationInvestigationController.ProofPhoto;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

/** Handbook E26: what Borzo and Pidge recorded at the drop, read from a stored delivery event. */
class ProofOfDeliveryTest {
    private static final OffsetDateTime AT = OffsetDateTime.parse("2026-11-05T07:41:00Z");

    private static ProofOfDeliverySnapshot read(String provider, String body) {
        return ProofOfDelivery.read(provider, body, AT, "DELIVERED");
    }

    @Test
    void borzoCheckInOnTheDropPointIsReadAndTheCodeIsNeverUsed() {
        ProofOfDeliverySnapshot proof = read("borzo", """
            {"event_type":"order_changed","order":{"order_id":1250032,"points":[
              {"address":"Kitchen road 1","place_photo_url":"https://borzo.example/kitchen.jpg"},
              {"address":"12 Real Street","courier_visit_datetime":"2026-11-05T13:10:00+05:30","checkin_code":"4417",
               "place_photo_url":"https://borzo.example/door.jpg","sign_photo_url":"https://borzo.example/sign.jpg",
               "checkin":{"recipient_full_name":"  Asha\\u0007\\u202e R  ","recipient_position":"Neighbour"}}]}}""");

        assertThat(proof).isNotNull();
        assertThat(proof.providerId()).isEqualTo("borzo");
        assertThat(proof.status()).isEqualTo("DELIVERED");
        assertThat(proof.occurredAt()).isEqualTo(AT);
        assertThat(proof.courierVisitAt()).isEqualTo(OffsetDateTime.parse("2026-11-05T13:10:00+05:30"));
        assertThat(proof.recipientName()).isEqualTo("Asha   R");
        assertThat(proof.recipientPosition()).isEqualTo("Neighbour");
        assertThat(proof.photos()).containsExactly(new ProofPhoto("PLACE", "https://borzo.example/door.jpg"),
            new ProofPhoto("SIGNATURE", "https://borzo.example/sign.jpg"));
        assertThat(proof.toString()).doesNotContain("4417");
    }

    @Test
    void aPinIssuedForThePointIsNotProofAndTheKitchenPointNeverCounts() {
        assertThat(read("borzo", """
            {"order":{"status":"canceled","points":[{"place_photo_url":"https://borzo.example/kitchen.jpg",
              "checkin":{"recipient_full_name":"Chef"}},{"checkin_code":"4417"}]}}""")).isNull();
        assertThat(read("borzo", """
            {"order":{"points":[{},{"place_photo_url":"http://borzo.example/door.jpg","sign_photo_url":"https://b.example/s 1.jpg",
              "courier_visit_datetime":"yesterday"}]}}""")).isNull();
    }

    @Test
    void anErasedBodyReadsAsAbsentExceptTheVisitTime() {
        ProofOfDeliverySnapshot erased = read("borzo", """
            {"order":{"points":[{},{"courier_visit_datetime":"2026-11-05T13:10:00+05:30","place_photo_url":"[deleted]",
              "sign_photo_url":"[deleted]","checkin":{"recipient_full_name":"[deleted]","recipient_position":"[deleted]"}}]}}""");
        assertThat(erased.recipientName()).isNull();
        assertThat(erased.recipientPosition()).isNull();
        assertThat(erased.photos()).isEmpty();
        assertThat(erased.courierVisitAt()).isNotNull();
    }

    @Test
    void aTrackingPollKeepsTheProviderBodyUnderTheDeliveryMetadata() {
        ProofOfDeliverySnapshot polled = read("borzo", """
            {"delivery":{"providerId":"borzo","providerMetadata":{"order_id":1,"points":[{},
              {"checkin":{"recipient_full_name":"Asha R"}}]}},"courier":null}""");
        assertThat(polled.recipientName()).isEqualTo("Asha R");

        ProofOfDeliverySnapshot pidge = read("pidge", """
            {"delivery":{"providerMetadata":{"fulfillment":{"drop":{"proof":["https://pidge.example/door.jpg"]}}}}}""");
        assertThat(pidge.photos()).containsExactly(new ProofPhoto("PROOF", "https://pidge.example/door.jpg"));
    }

    @Test
    void pidgeDropProofLinksAreReadAndCapped() {
        ProofOfDeliverySnapshot proof = read("pidge", """
            {"id":"p-1","fulfillment":{"status":"DELIVERED","drop":{"proof":["https://pidge.example/door.jpg",{"url":"x"},"ftp://x"]}}}""");
        assertThat(proof.providerId()).isEqualTo("pidge");
        assertThat(proof.photos()).containsExactly(new ProofPhoto("PROOF", "https://pidge.example/door.jpg"));
        assertThat(proof.recipientName()).isNull();

        StringBuilder many = new StringBuilder("{\"fulfillment\":{\"drop\":{\"proof\":[");
        for (int i = 0; i < 15; i++) {
            many.append(i == 0 ? "" : ",").append("\"https://pidge.example/").append(i).append(".jpg\"");
        }
        assertThat(read("pidge", many.append("]}}}").toString()).photos()).hasSize(10);

        String longName = "😀".repeat(300);
        ProofOfDeliverySnapshot capped = read("borzo", "{\"order\":{\"points\":[{},{\"checkin\":{\"recipient_full_name\":\"" + longName + "\"}}]}}");
        assertThat(capped.recipientName().codePointCount(0, capped.recipientName().length())).isEqualTo(200);
        assertThat(Character.isHighSurrogate(capped.recipientName().charAt(capped.recipientName().length() - 1))).isFalse();
    }

    @Test
    void bodiesWithoutProofOrFromOtherProvidersGiveNothing() {
        assertThat(read("pidge", "{\"fulfillment\":{\"drop\":{\"proof\":[]}}}")).isNull();
        assertThat(read("borzo", "{\"delivery\":{\"order_id\":\"1\",\"status\":\"finished\"}}")).isNull();
        assertThat(read("shiprocket", "{\"order\":{\"points\":[{},{\"checkin\":{\"recipient_full_name\":\"A\"}}]}}")).isNull();
        assertThat(read("borzo", "not json")).isNull();
        assertThat(read("borzo", "[1]")).isNull();
        assertThat(read(null, "{}")).isNull();
    }
}
