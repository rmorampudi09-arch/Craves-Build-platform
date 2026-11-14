package in.craves.userchef.onboarding;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import in.craves.userchef.onboarding.ChefOnboardingDtos.AdminDraft;
import in.craves.userchef.onboarding.ChefOnboardingDtos.DraftApplicant;
import in.craves.userchef.onboarding.ChefOnboardingDtos.ProofKind;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AdminDraftJsonTest {
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    /** The admin page reads the applicant at the top level, so the list keeps its shape and only gains "details". */
    @Test void theAdminListKeepsItsShapeAndAddsWhatWasSaved() throws Exception {
        var applicant=new DraftApplicant(UUID.randomUUID(),"Ravi","Kumar","ravi@example.test",true,"+919848012345","kitchen-photos","DRAFT",null,
            Instant.parse("2026-11-01T06:00:00Z"),Instant.parse("2026-11-02T06:00:00Z"),"Kitchen","Hyderabad","500001");
        var row=json.readTree(json.writeValueAsString(new AdminDraft(applicant,ChefOnboardingPolicyTest.details(ProofKind.PAN,null))));
        assertEquals("Ravi",row.path("firstName").asText());assertEquals("kitchen-photos",row.path("step").asText());
        assertEquals("2026-11-02T06:00:00Z",row.path("lastActivityAt").asText());assertFalse(row.has("applicant"));
        assertEquals("1990-01-01",row.path("details").path("dateOfBirth").asText());
        assertEquals("Description",row.path("details").path("kitchenDescription").asText());
        assertTrue(json.readTree(json.writeValueAsString(new AdminDraft(applicant,null))).path("details").isNull());
    }
}
