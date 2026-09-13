package in.craves.auth.academy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.admin.InternalAdminRoles;
import in.craves.auth.security.CurrentUser;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AcademyCoreTest {
    private Authentication actor(List<String> roles) {
        return new UsernamePasswordAuthenticationToken(new CurrentUser(UUID.randomUUID(),"test","test",roles,1),"unused",List.of());
    }
    @Test void correctEvidenceRaisesMasteryAndWrongEvidenceLowersIt() {
        assertTrue(AcademyLearningModel.update(.25,true)>.25);
        assertTrue(AcademyLearningModel.update(.8,false)<.8);
        for(double p: new double[]{0,.25,.8,1}) for(boolean answer: new boolean[]{true,false}) {
            double next=AcademyLearningModel.update(p,answer); assertTrue(next>=.01 && next<=.99);
        }
    }
    @Test void invalidModelInputsAreRejected() {
        for(double p:new double[]{-1,2,Double.NaN,Double.POSITIVE_INFINITY}) assertThrows(IllegalArgumentException.class,()->AcademyLearningModel.update(p,true));
        assertEquals(100,AcademyLearningModel.score(2,2));assertEquals(50,AcademyLearningModel.score(1,2));
        assertEquals(67,AcademyLearningModel.score(2,3));
        assertThrows(IllegalArgumentException.class,()->AcademyLearningModel.score(1,0));
    }
    @Test void catalogContainsEngineeringCurriculumAndNoPublicAnswerKeys() throws Exception {
        var mapper=new ObjectMapper();var catalog=new AcademyCatalog(mapper);var view=catalog.publicCatalog();
        assertEquals("academy-2026-09-13-v3",catalog.version());
        assertEquals(15,view.path("courses").size());
        assertEquals("9cf4aea069fa6a077fdef111bf2df4eeada696fc",catalog.sourceRevision());
        int sections=0,questions=0,checkpoints=0;
        for(var course:view.path("courses"))for(var lesson:course.path("lessons")){
            sections++;
            assertEquals(2,lesson.path("questions").size());
            for(var q:lesson.path("questions")){questions++;assertFalse(q.has("answer"));assertFalse(q.has("explanation"));}
            for(var step:lesson.path("steps"))if(step.path("label").asText().equals("Reasoning checkpoint (ungraded)"))checkpoints++;
        }
        assertEquals(75,sections);assertEquals(150,questions);assertEquals(25,checkpoints);
        assertTrue(mapper.writeValueAsBytes(view).length<=900000,"Keep headroom below the existing one-MiB BFF bound");
        assertEquals(view,catalog.publicCatalog(),"Repeated reads must not append duplicate checkpoints");
        assertTrue(catalog.courses().get(0).path("lessons").get(0).path("questions").get(0).has("answer"));
        assertEquals("platform-engineering",catalog.course("platform-engineering").path("id").asText());
        assertThrows(ResponseStatusException.class,()->catalog.course("unknown"));
        assertThrows(ResponseStatusException.class,()->catalog.sourcePath("auth",999));
    }
    @Test void appliedTracksPreserveEveryExtraQuestionAsAnExplicitUngradedCheckpoint() throws Exception {
        var mapper=new ObjectMapper();var catalog=new AcademyCatalog(mapper);
        for(String id:List.of("java-engineering","mobile-engineering","data-engineering","document-engineering","service-labs")){
            var course=catalog.course(id);
            assertEquals(id.equals("service-labs")?9:4,course.path("lessons").size());
            assertTrue(course.path("sources").size()<=10);
            for(int i=0;i<course.path("sources").size();i++)assertTrue(AcademySources.isReviewedPath(catalog.sourcePath(id,i)));
            try(var input=new ClassPathResource("academy/engineering/"+id+".json").getInputStream()){
                var source=mapper.readTree(input).path("course");
                for(var raw:source.path("lessons")){
                    var lesson=catalog.lesson(id,raw.path("id").asText());
                    assertEquals(3,raw.path("questions").size());
                    assertEquals(2,lesson.path("questions").size());
                    assertEquals(raw.path("questions").get(0),lesson.path("questions").get(0));
                    assertEquals(raw.path("questions").get(1),lesson.path("questions").get(1));
                    assertEquals(raw.path("steps").size()+1,lesson.path("steps").size());
                    var extra=raw.path("questions").get(2);
                    var step=lesson.path("steps").get(lesson.path("steps").size()-1);
                    assertEquals("Reasoning checkpoint (ungraded)",step.path("label").asText());
                    assertTrue(step.path("detail").asText().contains(extra.path("prompt").asText()));
                    assertTrue(step.path("detail").asText().contains(extra.path("options").get(extra.path("answer").asInt()).asText()));
                    assertTrue(step.path("detail").asText().contains(extra.path("explanation").asText()));
                    for(String field:List.of("overview","example","lab","pitfall"))assertFalse(lesson.path(field).asText().isBlank());
                }
            }
        }
    }
    @Test void reviewedSourceAllowlistSupportsPinnedEngineeringEvidenceOnly() {
        assertTrue(AcademySources.isReviewedPath("services/auth-service/src/main/java/in/craves/auth/web/AuthController.java"));
        assertTrue(AcademySources.isReviewedPath("apps/customer-web-next/src/lib/server-api.ts"));
        assertTrue(AcademySources.isReviewedPath(".github/workflows/craves-academy-ci.yml"));
        assertTrue(AcademySources.isReviewedPath("scripts/academy/verify-curriculum.py"));
        assertFalse(AcademySources.isReviewedPath("../../etc/passwd"));
        assertFalse(AcademySources.isReviewedPath(".github/workflows/../secret.yml"));
        assertFalse(AcademySources.isReviewedPath("config/production/secret.json"));
        assertFalse(AcademySources.isReviewedPath("services/auth-service/.env"));
    }
    @Test void everyExplicitInternalAdminCanLearnButCustomersCannot() {
        for(String role:InternalAdminRoles.codes())assertNotNull(AcademyController.requireAdmin(actor(List.of(role))));
        for(List<String> roles:List.of(List.of("CUSTOMER"),List.of("CHEF"),List.of("ADMIN"),List.of("made_up_admin"))) {
            assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->AcademyController.requireAdmin(actor(roles))).getStatusCode());
        }
        assertEquals(HttpStatus.UNAUTHORIZED,assertThrows(ResponseStatusException.class,()->AcademyController.requireAdmin(null)).getStatusCode());
        assertThrows(ResponseStatusException.class,()->AcademyController.requireAdmin(actor(null)));
    }
    @Test void roleBoundariesAndMalformedClaimsFailClosed() {
        assertNotNull(AcademyController.requireManager(actor(List.of("PLATFORM_ADMIN"))));
        assertNotNull(AcademyController.requireReporter(actor(List.of("AUDIT_ADMIN"))));
        assertThrows(ResponseStatusException.class,()->AcademyController.requireManager(actor(List.of("AUDIT_ADMIN"))));
        assertThrows(ResponseStatusException.class,()->AcademyController.requireReporter(actor(List.of("SUPPORT_ADMIN"))));
        assertNotNull(AcademyController.requireManager(actor(Arrays.asList(null," platform_admin "))));
        assertThrows(ResponseStatusException.class,()->AcademyController.requireAdmin(actor(Arrays.asList(null,"CUSTOMER"))));
    }
}
