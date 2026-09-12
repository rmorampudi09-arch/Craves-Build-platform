package in.craves.auth.academy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

@Component
public class AcademyCatalog {
    private final JsonNode catalog;
    public AcademyCatalog(ObjectMapper mapper) throws IOException {
        try (var input = new ClassPathResource("academy/curriculum.json").getInputStream()) {
            catalog = mapper.readTree(input);
        }
        Set<String> ids = new HashSet<>();
        for (JsonNode course : catalog.path("courses")) {
            if (!ids.add(course.path("id").asText())) throw new IllegalStateException("Duplicate academy course");
            Set<String> lessons = new HashSet<>();
            for (JsonNode lesson : course.path("lessons")) {
                if (!lessons.add(lesson.path("id").asText()) || lesson.path("questions").isEmpty()) {
                    throw new IllegalStateException("Invalid academy lesson");
                }
                for (JsonNode q : lesson.path("questions")) {
                    int answer = q.path("answer").asInt(-1);
                    if (answer < 0 || answer >= q.path("options").size()) throw new IllegalStateException("Invalid academy answer");
                }
            }
        }
    }
    public String version() { return catalog.path("version").asText(); }
    public String sourceRevision() { return catalog.path("sourceRevision").asText(); }
    public JsonNode courses() { return catalog.path("courses"); }
    public JsonNode publicCatalog() {
        ObjectNode copy = catalog.deepCopy();
        for (JsonNode c : copy.path("courses")) for (JsonNode l : c.path("lessons"))
            for (JsonNode q : l.path("questions")) ((ObjectNode) q).remove(java.util.List.of("answer", "explanation"));
        return copy;
    }
    public JsonNode course(String id) {
        for (JsonNode c : courses()) if (c.path("id").asText().equals(id)) return c;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found");
    }
    public JsonNode lesson(String courseId, String lessonId) {
        for (JsonNode l : course(courseId).path("lessons")) if (l.path("id").asText().equals(lessonId)) return l;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not found");
    }
    public String sourcePath(String courseId, int index) {
        JsonNode sources = course(courseId).path("sources");
        if (index < 0 || index >= sources.size()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Source not found");
        return sources.get(index).asText();
    }
}
