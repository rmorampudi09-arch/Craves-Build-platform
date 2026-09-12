package in.craves.auth.academy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.admin.InternalAdminRoles;
import in.craves.auth.security.CurrentUser;
import org.junit.jupiter.api.Test;
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
        assertThrows(IllegalArgumentException.class,()->AcademyLearningModel.score(1,0));
    }
    @Test void catalogContainsNineGroundedCoursesAndNoPublicAnswerKeys() throws Exception {
        var catalog=new AcademyCatalog(new ObjectMapper());var view=catalog.publicCatalog();
        assertEquals(9,view.path("courses").size());assertTrue(catalog.sourceRevision().matches("[a-f0-9]{40}"));
        int sections=0,questions=0;
        for(var course:view.path("courses"))for(var lesson:course.path("lessons")){
            sections++;for(var q:lesson.path("questions")){questions++;assertFalse(q.has("answer"));assertFalse(q.has("explanation"));}
        }
        assertEquals(18,sections);assertEquals(36,questions);
        assertTrue(catalog.courses().get(0).path("lessons").get(0).path("questions").get(0).has("answer"));
        assertThrows(ResponseStatusException.class,()->catalog.course("unknown"));
        assertThrows(ResponseStatusException.class,()->catalog.sourcePath("auth",999));
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
