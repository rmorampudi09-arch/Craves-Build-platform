package in.craves.integration.fleet;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retention (BACKEND.md "Data retention", blueprint E6, WORKPLAN P2-09): a shift's selfie goes 30 days after the shift
 * started, and a delivery photo 90 days after the delivery, unless flagged or disputed. Flagged: a selfie ops rejected.
 * Disputed: the trip's pay is on hold (or held and not credited yet), or a support issue about the trip is not fixed.
 * Daily at 03:10 IST, behind CRAVES_FLEET_PHOTO_RETENTION_ENABLED (off): while off it only logs how many are due, so ops
 * sees the numbers before anything is deleted.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPhotoRetention {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetPhotoRetention.class);
    static final int SELFIE_DAYS = 30;
    static final int PHOTO_DAYS = 90;
    static final int BATCH = 500;
    private static final int MAX_ROUNDS = 20;
    private static final String SELFIES_DUE = """
         FROM fleet_schema.rider_shift
        WHERE selfie_blob IS NOT NULL AND selfie_state <> 'REJECTED' AND started_at < now() - make_interval(days => %d)"""
        .formatted(SELFIE_DAYS);
    private static final String PHOTOS_DUE = """
         FROM fleet_schema.trip_event e JOIN fleet_schema.trip t ON t.id = e.trip_id
        WHERE e.kind = 'DELIVERED' AND e.detail ->> 'photoBlob' IS NOT NULL AND e.created_at < now() - make_interval(days => %d)
          AND NOT (t.pay_held AND t.pay_credited_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_pay_hold h WHERE h.trip_id = t.id AND h.state = 'ACTIVE')
          AND NOT EXISTS (SELECT 1 FROM fleet_schema.support_issue s WHERE s.trip_id = t.id AND s.state <> 'FIXED')"""
        .formatted(PHOTO_DAYS);

    private final JdbcTemplate jdbc;
    private final FleetStorage storage;
    private final boolean enabled;

    public FleetPhotoRetention(JdbcTemplate jdbc, FleetStorage storage,
                               @Value("${craves.fleet.photo-retention-enabled:false}") boolean enabled) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.enabled = enabled;
    }

    public record Result(int selfies, int photos, int failed) {
    }

    @Scheduled(cron = "0 10 3 * * *", zone = "Asia/Kolkata", scheduler = FleetConfiguration.FLEET_SCHEDULER)
    public void daily() {
        try {
            if (!enabled) {
                LOGGER.info("FLEET_PHOTO_RETENTION off (CRAVES_FLEET_PHOTO_RETENTION_ENABLED): due selfies={} photos={}",
                    jdbc.queryForObject("SELECT count(*)" + SELFIES_DUE, Integer.class), jdbc.queryForObject("SELECT count(*)" + PHOTOS_DUE, Integer.class));
                return;
            }
            Result result = run();
            LOGGER.info("FLEET_PHOTO_RETENTION selfies={} photos={} failed={}", result.selfies(), result.photos(), result.failed());
            if (result.failed() > 0) {
                LOGGER.error("CRAVES_ALERT alert=FLEET_PHOTO_RETENTION_FAILED failed={} (kept for the next run)", result.failed());
            }
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_PHOTO_RETENTION_FAILED reason={}", exception.toString());
        }
    }

    /** Deletes what is due now, BATCH at a time. */
    public Result run() {
        int[] selfies = sweep("SELECT id, selfie_blob AS blob" + SELFIES_DUE + " ORDER BY started_at LIMIT " + BATCH,
            "UPDATE fleet_schema.rider_shift SET selfie_blob = NULL, selfie_size_bytes = NULL WHERE id = ? AND selfie_blob = ?");
        int[] photos = sweep("SELECT e.id, e.detail ->> 'photoBlob' AS blob" + PHOTOS_DUE + " ORDER BY e.created_at LIMIT " + BATCH,
            "UPDATE fleet_schema.trip_event SET detail = (detail - 'photoBlob') || jsonb_build_object('photoDeletedAt', now()) "
                + "WHERE id = ? AND detail ->> 'photoBlob' = ?");
        return new Result(selfies[0], photos[0], selfies[1] + photos[1]);
    }

    /** {deleted, failed}. The file first, then its reference: a file that could not go keeps its reference for the next run. */
    private int[] sweep(String due, String forget) {
        int deleted = 0;
        int failed = 0;
        for (int round = 0; round < MAX_ROUNDS; round++) {
            List<Map<String, Object>> rows = jdbc.queryForList(due);
            int failedBefore = failed;
            for (Map<String, Object> row : rows) {
                String blob = (String) row.get("blob");
                try {
                    storage.delete(blob);
                    jdbc.update(forget, row.get("id"), blob);
                    deleted++;
                } catch (RuntimeException exception) {
                    failed++;
                    LOGGER.warn("FLEET_PHOTO_RETENTION kept {}: {}", blob, exception.toString());
                }
            }
            // A failure would come back in the next batch: stop and leave it for tomorrow.
            if (rows.size() < BATCH || failed > failedBefore) {
                break;
            }
        }
        return new int[] {deleted, failed};
    }
}
