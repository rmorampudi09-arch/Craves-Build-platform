package in.craves.advanced.platform.data;

import java.util.Map;
import java.util.UUID;

/** Implemented by every module that stores a person's taste data, so export and erase cover all of it. */
public interface PersonalDataContributor {
    String moduleId();

    Map<String, Object> export(UUID person);

    /** Deletes the person's own data in this module and returns how many records were removed. */
    int erase(UUID person);

    /**
     * Deletes only the person's data as a customer and returns how many records were touched; used when a dual-role person deletes
     * just their customer side, so records that name them as a chef or kitchen keep their ids. Modules with no chef-side rows need not override it.
     */
    default int eraseCustomerSide(UUID person) {
        return erase(person);
    }
}
