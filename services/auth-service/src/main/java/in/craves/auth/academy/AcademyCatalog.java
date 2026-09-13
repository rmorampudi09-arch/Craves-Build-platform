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
        try (var input = resource.getInputStream()) {
            index = mapper.readTree(input);
        }
        requireText(index, "version");
        requireText(index, "sourceRevision");
        requireText(index, "reviewedOn");
        requireText(index, "evidenceLabel");
        catalog.put("version", index.path("version").asText());
        catalog.put("sourceRevision", index.path("sourceRevision").asText());
        catalog.put("reviewedOn", index.path("reviewedOn").asText());
        catalog.put("evidenceLabel", index.path("evidenceLabel").asText());

        for (JsonNode file : index.path("enhancements")) {
            JsonNode enhancement = readEngineeringFile(mapper, file.asText());
            mergeEnhancement(enhancement);
        }
        for (JsonNode file : index.path("newCourses")) {
            JsonNode addition = readEngineeringFile(mapper, file.asText());
            JsonNode course = addition.path("course");
            if (!course.isObject()) throw new IllegalStateException("Engineering course file is invalid: " + file.asText());
            catalog.withArray("courses").add(course.deepCopy());
        }
    }

    private JsonNode readEngineeringFile(ObjectMapper mapper, String file) throws IOException {
        if (file == null || !file.matches("[a-z0-9-]+\\.json")) {
            throw new IllegalStateException("Invalid engineering curriculum file");
        }
        var resource = new ClassPathResource(ENGINEERING_ROOT + file);
        if (!resource.exists()) throw new IllegalStateException("Missing engineering curriculum file: " + file);
        try (var input = resource.getInputStream()) {
            return mapper.readTree(input);
        }
    }

    private void mergeEnhancement(JsonNode enhancement) {
        String courseId = enhancement.path("courseId").asText();
        ObjectNode course = findCourseNode(courseId);
        if (course == null) throw new IllegalStateException("Unknown Academy course enhancement: " + courseId);

        Set<String> existingSources = new HashSet<>();
        ArrayNode sources = course.withArray("sources");
        sources.forEach(source -> existingSources.add(source.asText()));
        for (JsonNode source : enhancement.path("addSources")) {
            if (existingSources.add(source.asText())) sources.add(source.asText());
        }

        ArrayNode lessons = course.withArray("lessons");
        for (JsonNode lesson : enhancement.path("lessons")) lessons.add(lesson.deepCopy());
        int minutesAdded = enhancement.path("minutesAdded").asInt(0);
        if (minutesAdded < 0) throw new IllegalStateException("Academy minutesAdded cannot be negative");
        course.put("minutes", course.path("minutes").asInt(0) + minutesAdded);
    }

    private ObjectNode findCourseNode(String id) {
        for (JsonNode course : catalog.path("courses")) {
            if (course.path("id").asText().equals(id)) return (ObjectNode) course;
        }
        return null;
    }

    private void validateCatalog() {
        if (!catalog.path("sourceRevision").asText().matches("[a-f0-9]{40}")) {
            throw new IllegalStateException("Academy source revision must be pinned");
        }
        Set<String> courseIds = new HashSet<>();
        Set<String> lessonIds = new HashSet<>();
        Set<String> questionIds = new HashSet<>();

        for (JsonNode course : catalog.path("courses")) {
            String courseId = course.path("id").asText();
            if (courseId.isBlank() || !courseIds.add(courseId)) throw new IllegalStateException("Duplicate academy course");
            if (course.path("sources").isEmpty() || course.path("lessons").isEmpty() || course.path("minutes").asInt() <= 0) {
                throw new IllegalStateException("Invalid academy course: " + courseId);
            }
            for (JsonNode lesson : course.path("lessons")) {
                String lessonId = lesson.path("id").asText();
                if (lessonId.isBlank() || !lessonIds.add(lessonId) || lesson.path("questions").isEmpty()) {
                    throw new IllegalStateException("Invalid academy lesson");
                }
                for (JsonNode question : lesson.path("questions")) {
                    String questionId = question.path("id").asText();
                    if (questionId.isBlank() || !questionIds.add(questionId)) {
                        throw new IllegalStateException("Duplicate academy question");
                    }
                    int answer = question.path("answer").asInt(-1);
                    if (answer < 0 || answer >= question.path("options").size()) {
                        throw new IllegalStateException("Invalid academy answer");
                    }
                }
            }
        }
        for (JsonNode course : catalog.path("courses")) {
            String courseId = course.path("id").asText();
            for (JsonNode prerequisite : course.path("prerequisites")) {
                String required = prerequisite.asText();
                if (required.equals(courseId) || !courseIds.contains(required)) {
                    throw new IllegalStateException("Invalid academy prerequisite");
                }
            }
        }
    }

    private static void requireText(JsonNode node, String field) {
        if (!node.path(field).isTextual() || node.path(field).asText().isBlank()) {
            throw new IllegalStateException("Missing engineering curriculum metadata: " + field);
        }
    }

    public String version() { return catalog.path("version").asText(); }
    public String sourceRevision() { return catalog.path("sourceRevision").asText(); }
    public JsonNode courses() { return catalog.path("courses"); }

    public JsonNode publicCatalog() {
        ObjectNode copy = catalog.deepCopy();
        for (JsonNode course : copy.path("courses")) {
            for (JsonNode lesson : course.path("lessons")) {
                for (JsonNode question : lesson.path("questions")) {
                    ((ObjectNode) question).remove(java.util.List.of("answer", "explanation"));
                }
            }
        }
        return copy;
    }

    public JsonNode course(String id) {
        for (JsonNode course : courses()) if (course.path("id").asText().equals(id)) return course;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found");
    }

    public JsonNode lesson(String courseId, String lessonId) {
        for (JsonNode lesson : course(courseId).path("lessons")) {
            if (lesson.path("id").asText().equals(lessonId)) return lesson;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found");
    }

    public String sourcePath(String courseId, int index) {
        JsonNode sources = course(courseId).path("sources");
        if (index < 0 || index >= sources.size()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Source not found");
        return sources.get(index).asText();
    }
}
