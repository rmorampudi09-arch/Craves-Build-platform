package in.craves.advanced.accountdeletion;

import in.craves.advanced.platform.data.PersonalDataContributor;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The person's deletion requests appear in their export. Erasing keeps the requests (the record that the person asked and what Craves
 * did) but clears their free-text reason. Uses the table directly (not the service) so the eraser, which every contributor feeds, has no
 * cycle back to it.
 */
@Component
class AccountDeletionData implements PersonalDataContributor {
    private final JdbcTemplate jdbc;

    AccountDeletionData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String moduleId() {
        return AccountDeletionModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        return Map.of("requests", jdbc.queryForList("SELECT id, status, reason, message_to_person, created_at, closed_at "
                + "FROM adv_account_deletion.request WHERE person_id = ? ORDER BY created_at, id", person));
    }

    @Override
    public int erase(UUID person) {
        return jdbc.update("UPDATE adv_account_deletion.request SET reason = NULL WHERE person_id = ? AND reason IS NOT NULL", person);
    }
}
