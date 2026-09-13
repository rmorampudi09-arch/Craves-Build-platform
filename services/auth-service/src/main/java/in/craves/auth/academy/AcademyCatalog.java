package in.craves.auth.academy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

@Component
public class AcademyCatalog {
    private static final String BASE_CATALOG = "academy/curriculum.json";
    private static final String ENGINEERING_INDEX = "academy/engineering/index.json";
    private static final String ENGINEERING_ROOT = "academy/engineering/";
    private final ObjectNode catalog;

    public AcademyCatalog(ObjectMapper mapper) throws IOException {
        try (var input = new ClassPathResource(BASE_CATALOG).getInputStream()) {
            JsonNode loaded = mapper.readTree(input);
            if (!(loaded instanceof ObjectNode root)) {
                throw new IllegalStateException("Academy catalog root must be an object");
            }
            catalog = root;
        }
        applyEngineeringCurriculum(mapper);
        validateCatalog();
    }

    private void applyEngineeringCurriculum(ObjectMapper mapper) throws IOException {
        var resource = new ClassPathResource(ENGINEERING_INDEX);
        if (!resource.exists()) return;
        JsonNode index;
        try (var input = resource.getInputStream()) { index = mapper.readTree(input); }
        for (String field : Set.of("version", "sourceRevision", "reviewedOn", "evidenceLabel")) {
            requireText(index, field);
            catalog.put(field, index.path(field).asText());
        }
        for (JsonNode file : index.path("enhancements")) {
            mergeEnhancement(readEngineeringFile(mapper, file.asText()));
        }
        for (JsonNode file : index.path("newCourses")) {
            JsonNode addition = readEngineeringFile(mapper, file.asText());
            JsonNode course = addition.path("course");
            if (!course.isObject()) throw new IllegalStateException("Engineering course file is invalid: " + file.asText());
            catalog.withArray("courses").add(course.deepCopy());
        }
        if (index.has("readingPacks")) {
            if (!index.path("readingPacks").isArray() || index.path("readingPacks").isEmpty()) {
                throw new IllegalStateException("Reading packs must be a nonempty array");
            }
            Set<String> files = new HashSet<>(), coveredCourses = new HashSet<>();
            for (JsonNode file : index.path("readingPacks")) {
                if (!file.isTextual() || !files.add(file.asText())) {
                    throw new IllegalStateException("Duplicate or invalid Academy reading file");
                }
                JsonNode pack = readEngineeringFile(mapper, file.asText());
                String courseId = pack.path("courseId").asText();
                ObjectNode course = findCourseNode(courseId);
                if (course == null || !coveredCourses.add(courseId)) {
                    throw new IllegalStateException("Unknown or duplicate reading course: " + courseId);
                }
                applyReadingPack(course, pack);
            }
            if (coveredCourses.size() != catalog.path("courses").size()) {
                throw new IllegalStateException("Reading expansion must cover every Academy course");
            }
            requireText(index, "readingEdition");
            catalog.put("readingEdition", index.path("readingEdition").asText());
        }
    }

    private JsonNode readEngineeringFile(ObjectMapper mapper, String file) throws IOException {
        if (file == null || !file.matches("[a-z0-9-]+\\.json")) {
            throw new IllegalStateException("Invalid engineering curriculum file");
        }
        var resource = new ClassPathResource(ENGINEERING_ROOT + file);
        if (!resource.exists()) throw new IllegalStateException("Missing engineering curriculum file: " + file);
        try (var input = resource.getInputStream()) { return mapper.readTree(input); }
    }

    private void mergeEnhancement(JsonNode enhancement) {
        String courseId = enhancement.path("courseId").asText();
        ObjectNode course = findCourseNode(courseId);
        if (course == null) throw new IllegalStateException("Unknown Academy course enhancement: " + courseId);
        addSources(course, enhancement.path("addSources"));
        for (JsonNode lesson : enhancement.path("lessons")) course.withArray("lessons").add(lesson.deepCopy());
        int minutesAdded = enhancement.path("minutesAdded").asInt(0);
        if (minutesAdded < 0) throw new IllegalStateException("Academy minutesAdded cannot be negative");
        course.put("minutes", Math.addExact(course.path("minutes").asInt(0), minutesAdded));
    }

    /** Reading-only augmentation: questions, lesson IDs and assessment version cannot be replaced. */
    static void applyReadingPack(ObjectNode course, JsonNode pack) {
        requireOnlyFields(pack, Set.of("courseId", "minutesAdded", "addSources", "lessons"));
        if (!course.path("id").asText().equals(pack.path("courseId").asText())) {
            throw new IllegalStateException("Reading course mismatch");
        }
        if (!pack.path("minutesAdded").isIntegralNumber() || !pack.path("minutesAdded").canConvertToInt()
            || pack.path("minutesAdded").asInt() <= 0 || !pack.path("addSources").isArray()
            || !pack.path("lessons").isArray() || pack.path("lessons").isEmpty()) {
            throw new IllegalStateException("Invalid reading pack shape");
        }
        // Stage on a copy so an invalid pack cannot partly alter the course.
        ObjectNode merged = course.deepCopy();
        addSources(merged, pack.path("addSources"));
        Set<String> coveredLessons = new HashSet<>();
        for (JsonNode addition : pack.path("lessons")) {
            requireOnlyFields(addition, Set.of("id", "steps", "lab"));
            requireText(addition, "id");
            requireText(addition, "lab");
            String id = addition.path("id").asText();
            if (!coveredLessons.add(id) || !addition.path("steps").isArray() || addition.path("steps").size() < 3) {
                throw new IllegalStateException("Duplicate or incomplete reading lesson: " + id);
            }
            ObjectNode target = null;
            for (JsonNode lesson : merged.path("lessons")) {
                if (id.equals(lesson.path("id").asText())) target = (ObjectNode) lesson;
            }
            if (target == null) throw new IllegalStateException("Unknown reading lesson: " + id);
            Set<String> labels = new HashSet<>();
            target.path("steps").forEach(step -> labels.add(step.path("label").asText()));
            for (JsonNode step : addition.path("steps")) {
                requireOnlyFields(step, Set.of("label", "detail"));
                requireText(step, "label");
                requireText(step, "detail");
                if (!labels.add(step.path("label").asText())) throw new IllegalStateException("Duplicate reading step label");
                target.withArray("steps").add(step.deepCopy());
            }
            target.put("lab", target.path("lab").asText() + "\n\n" + addition.path("lab").asText());
        }
        if (coveredLessons.size() != merged.path("lessons").size()) {
            throw new IllegalStateException("Reading pack must cover every lesson in its course");
        }
        merged.put("minutes", Math.addExact(merged.path("minutes").asInt(), pack.path("minutesAdded").asInt()));
        course.setAll(merged);
    }

    private static void addSources(ObjectNode course, JsonNode additions) {
        ArrayNode sources = course.withArray("sources");
        Set<String> known = new HashSet<>();
        sources.forEach(source -> known.add(source.asText()));
        for (JsonNode source : additions) {
            if (!source.isTextual() || !AcademySources.isReviewedPath(source.asText())) {
                throw new IllegalStateException("Unsupported Academy source path");
            }
            if (known.add(source.asText())) sources.add(source.asText());
        }
        // The unchanged BFF source route supports indices 0 through 9.
        if (sources.size() > 10) throw new IllegalStateException("Academy course exceeds client source limit");
    }

    private static void requireOnlyFields(JsonNode node, Set<String> allowed) {
        if (!node.isObject()) throw new IllegalStateException("Academy reading entry must be an object");
        node.fieldNames().forEachRemaining(field -> {
            if (!allowed.contains(field)) throw new IllegalStateException("Unsupported reading field: " + field);
        });
    }

    private ObjectNode findCourseNode(String id) {
        for (JsonNode course : catalog.path("courses")) {
            if (course.path("id").asText().equals(id)) return (ObjectNode) course;
        }
        return null;
    }

    private void validateCatalog() {
        if (!catalog.path("sourceRevision").asText().matches("[a-f0-9]{40}")) throw new IllegalStateException("Academy source revision must be pinned");
        Set<String> courseIds = new HashSet<>(), lessonIds = new HashSet<>(), questionIds = new HashSet<>();
        for (JsonNode course : catalog.path("courses")) {
            String courseId = course.path("id").asText();
            if (courseId.isBlank() || !courseIds.add(courseId)) throw new IllegalStateException("Duplicate academy course");
            if (course.path("sources").isEmpty() || course.path("sources").size() > 10 || course.path("lessons").isEmpty() || course.path("minutes").asInt() <= 0) {
                throw new IllegalStateException("Invalid academy course: " + courseId);
            }
            for (JsonNode source : course.path("sources")) {
                if (!source.isTextual() || !AcademySources.isReviewedPath(source.asText())) throw new IllegalStateException("Invalid Academy source path");
            }
            for (JsonNode lesson : course.path("lessons")) {
                String lessonId = lesson.path("id").asText();
                if (lessonId.isBlank() || !lessonIds.add(lessonId) || lesson.path("questions").isEmpty()) throw new IllegalStateException("Invalid academy lesson");
                for (JsonNode question : lesson.path("questions")) {
                    String questionId = question.path("id").asText();
                    if (questionId.isBlank() || !questionIds.add(questionId)) throw new IllegalStateException("Duplicate academy question");
                    int answer = question.path("answer").asInt(-1);
                    if (answer < 0 || answer >= question.path("options").size()) throw new IllegalStateException("Invalid academy answer");
                }
            }
        }
        for (JsonNode course : catalog.path("courses")) {
            for (JsonNode prerequisite : course.path("prerequisites")) {
                String required = prerequisite.asText();
                if (required.equals(course.path("id").asText()) || !courseIds.contains(required)) throw new IllegalStateException("Invalid academy prerequisite");
            }
        }
    }

    private static void requireText(JsonNode node, String field) {
        if (!node.path(field).isTextual() || node.path(field).asText().isBlank()) throw new IllegalStateException("Missing curriculum text: " + field);
    }

    public String version() { return catalog.path("version").asText(); }
    public String sourceRevision() { return catalog.path("sourceRevision").asText(); }
    public JsonNode courses() { return catalog.path("courses"); }
    public JsonNode publicCatalog() {
        ObjectNode copy = catalog.deepCopy();
        for (JsonNode course : copy.path("courses")) for (JsonNode lesson : course.path("lessons")) for (JsonNode question : lesson.path("questions")) {
            ((ObjectNode) question).remove(java.util.List.of("answer", "explanation"));
        }
        return copy;
    }
    public JsonNode course(String id) {
        for (JsonNode course : courses()) if (course.path("id").asText().equals(id)) return course;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found");
    }
    public JsonNode lesson(String courseId, String lessonId) {
        for (JsonNode lesson : course(courseId).path("lessons")) if (lesson.path("id").asText().equals(lessonId)) return lesson;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found");
    }
    public String sourcePath(String courseId, int index) {
        JsonNode sources = course(courseId).path("sources");
        if (index < 0 || index >= sources.size()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Source not found");
        return sources.get(index).asText();
    }
}
