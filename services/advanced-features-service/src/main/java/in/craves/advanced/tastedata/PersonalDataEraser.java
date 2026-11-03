package in.craves.advanced.tastedata;

import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Erases one person's data in every advanced module that is switched on: the self-service erase (E40) and a completed account deletion. */
@Component
public class PersonalDataEraser {
    /** skipped: switched-off or unavailable modules whose data was not touched. */
    public record Erased(int records, List<String> modules, List<String> skipped) { }

    private final List<PersonalDataContributor> contributors;
    private final ModuleRuntime runtime;
    private final JdbcTemplate jdbc;

    public PersonalDataEraser(List<PersonalDataContributor> contributors, ModuleRuntime runtime, JdbcTemplate jdbc) {
        this.contributors = contributors;
        this.runtime = runtime;
        this.jdbc = jdbc;
    }

    /** Call inside the caller's transaction. */
    public Erased erase(UUID person) {
        int total = 0;
        List<String> modules = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        if (usable(TasteDataModule.ID)) {
            total += jdbc.update("DELETE FROM adv_taste_data.consent WHERE person_id = ?", person);
        } else {
            skipped.add(TasteDataModule.ID);
        }
        for (PersonalDataContributor contributor : contributors) {
            if (!usable(contributor.moduleId())) {
                skipped.add(contributor.moduleId());
                continue;
            }
            total += contributor.erase(person);
            modules.add(contributor.moduleId());
        }
        // Stored replies of the person's keyed requests (they can hold names and notes) go too; they are caches, so the count leaves them out.
        // shortcut: no index on actor_id; the table keeps only 48 hours of keyed requests. Add one if erasing gets slow.
        jdbc.update("DELETE FROM adv_platform.idempotency_record WHERE actor_id = ?", person);
        return new Erased(total, modules, skipped);
    }

    boolean usable(String moduleId) {
        return runtime.modules().stream().filter(m -> m.id().equals(moduleId)).findFirst().map(module -> {
            try {
                runtime.ensureReady(module);
                return true;
            } catch (ApiProblem unavailable) {
                return false;
            }
        }).orElse(false);
    }
}
