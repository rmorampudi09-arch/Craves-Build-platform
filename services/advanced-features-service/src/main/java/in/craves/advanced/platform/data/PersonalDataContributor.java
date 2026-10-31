package in.craves.advanced.platform.data;

import java.util.Map;
import java.util.UUID;

/** Implemented by every module that stores a person's taste data, so export and erase cover all of it. */
public interface PersonalDataContributor {
    String moduleId();

    Map<String, Object> export(UUID person);

    /** Deletes the person's own data in this module and returns how many records were removed. */
    int erase(UUID person);
}
