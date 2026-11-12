package in.craves.userchef.onboarding;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Which Waitlist sign-up emails each applicant already got (table chef_signup_alert, V24). */
@Repository
public class ChefSignupAlertStore {
    record AlertRow(int lastRank, Instant lastRankAt, UUID helpAlertedId, boolean stallAlerted, boolean muted) {}
    record HelpRow(UUID id, String message) {}

    private final JdbcTemplate jdbc;

    public ChefSignupAlertStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Optional<AlertRow> find(UUID identityId) {
        return jdbc.query(
            "SELECT last_rank,last_rank_at,help_alerted_id,stall_alerted,muted FROM chef_signup_alert WHERE identity_id=?",
            (rs, row) -> new AlertRow(rs.getInt("last_rank"), rs.getTimestamp("last_rank_at").toInstant(),
                rs.getObject("help_alerted_id", UUID.class), rs.getBoolean("stall_alerted"), rs.getBoolean("muted")),
            identityId).stream().findFirst();
    }

    Optional<HelpRow> latestHelp(UUID identityId) {
        return jdbc.query(
            "SELECT id,message FROM chef_onboarding_help WHERE identity_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
            (rs, row) -> new HelpRow(rs.getObject("id", UUID.class), rs.getString("message")),
            identityId).stream().findFirst();
    }

    void insert(UUID identityId, int rank) {
        jdbc.update("INSERT INTO chef_signup_alert(identity_id,last_rank,last_rank_at) VALUES (?,?,now()) " +
            "ON CONFLICT (identity_id) DO NOTHING", identityId, rank);
    }

    void advance(UUID identityId, int rank) {
        // The 24 h clock restarts only on real progress; a lower rank changes nothing.
        jdbc.update("UPDATE chef_signup_alert SET last_rank=GREATEST(last_rank,?)," +
            "last_rank_at=CASE WHEN ?>last_rank THEN now() ELSE last_rank_at END,updated_at=now() WHERE identity_id=?",
            rank, rank, identityId);
    }

    void helpAlerted(UUID identityId, UUID helpId) {
        jdbc.update("UPDATE chef_signup_alert SET help_alerted_id=?,updated_at=now() WHERE identity_id=?", helpId, identityId);
    }

    void stallAlerted(UUID identityId) {
        jdbc.update("UPDATE chef_signup_alert SET stall_alerted=true,updated_at=now() WHERE identity_id=?", identityId);
    }
}
