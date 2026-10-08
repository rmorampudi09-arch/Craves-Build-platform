package in.craves.userchef.onboarding;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.email.AuthEmailProjectionService;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.AuthInternalClient;
import in.craves.userchef.service.ChefApplicationService;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.web.ApiDtos.ChefApplicationStatus;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;

@Service
public class ChefOnboardingService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ChefApplicationService applications;
    private final AuthInternalClient auth;
    private final AuthEmailProjectionService emailProjection;
    private final SupportCaseService support;
    private final boolean enabled;
    private final String supportPhone;
    private final String supportEmail;

    public ChefOnboardingService(JdbcTemplate jdbc, ObjectMapper json, ChefApplicationService applications,
        AuthInternalClient auth, AuthEmailProjectionService emailProjection, SupportCaseService support,
        @Value("${CRAVES_CHEF_ONBOARDING_V2_ENABLED:false}") boolean enabled,
        @Value("${CRAVES_ONBOARDING_SUPPORT_PHONE:8367366787}") String supportPhone,
        @Value("${CRAVES_ONBOARDING_SUPPORT_EMAIL:support@craves.in}") String supportEmail) {
        this.jdbc=jdbc; this.json=json; this.applications=applications; this.auth=auth;
        this.emailProjection=emailProjection; this.support=support; this.enabled=enabled;
        this.supportPhone=supportPhone; this.supportEmail=supportEmail;
    }

    public State mine(CurrentUser user) {
        requireApplicant(user);
        var application=applications.getMyApplication(user);
        var draft=find(user.identityId(),false);
        var documents=application.id()==null ? List.<in.craves.userchef.web.ApiDtos.KycDocumentResponse>of()
            : applications.listMyApplicationEvidence(user);
        boolean legacy=application.status()==ChefApplicationStatus.APPROVED ||
            application.id()!=null && draft==null;
        Details details=draft==null ? null : draft.details();
        boolean submitted=draft!=null && draft.submitted() && application.status()!=ChefApplicationStatus.REJECTED;
        String resume=legacy ? "legacy" : ChefOnboardingPolicy.resume(details,documents,submitted);
        return new State(enabled,legacy,draft==null ? 0 : draft.version(),resume,submitted,
            user.phoneNumber(),details,application,documents,
            details==null ? List.of() : ChefOnboardingPolicy.required(details.proofKind()).stream().map(Enum::name).sorted().toList(),
            supportPhone,supportEmail);
    }

    @Transactional
    public State save(CurrentUser user, SaveRequest request) {
        requireEnabled(); requireApplicant(user);
        if(request==null || request.expectedVersion()==null)
            throw ApiException.badRequest("ONBOARDING_VERSION_REQUIRED","Reload your saved application before continuing.");
        ChefOnboardingPolicy.validate(request.details());
        lock(user);
        var application=applications.getMyApplication(user);
        var existing=find(user.identityId(),true);
        if(application.status()==ChefApplicationStatus.APPROVED || application.id()!=null && existing==null)
            throw ApiException.conflict("CHEF_EXISTING_APPLICATION","Continue using your existing Chef application.");
        long version=existing==null ? 0 : existing.version();
        if(request.expectedVersion()!=version)
            throw ApiException.conflict("ONBOARDING_VERSION_CHANGED","Your application changed in another tab. Reload it.");
        Details input=request.details();
        String email=auth.requireVerifiedEmail(user.identityId(),input.email());
        Details details=new Details(email,input.firstName().trim(),input.lastName().trim(),input.dateOfBirth(),
            trim(input.kitchenName()),trim(input.kitchenDescription()),trim(input.addressLine1()),
            trim(input.addressLine2()),trim(input.landmark()),trim(input.city()),trim(input.state()),
            trim(input.postalCode()),input.latitude(),input.longitude(),input.proofKind(),trim(input.otherGovernmentId()),
            trim(input.fssaiNumber()),input.language());
        var docs=application.id()==null ? List.<in.craves.userchef.web.ApiDtos.KycDocumentResponse>of()
            : applications.listMyApplicationEvidence(user);
        if(existing!=null && !Objects.equals(existing.details().proofKind(),details.proofKind()) &&
            docs.stream().anyMatch(d -> d.documentType()==KycDocumentType.GOVERNMENT_ID_FRONT ||
                d.documentType()==KycDocumentType.GOVERNMENT_ID_BACK))
            throw ApiException.conflict("PROOF_CHOICE_LOCKED","The document choice is saved with your uploaded proof. Contact support to change it.");
        if(existing!=null && docs.stream().anyMatch(d -> "APPROVED".equals(d.status()) &&
            (d.documentType()==KycDocumentType.KITCHEN_PHOTO_1 || d.documentType()==KycDocumentType.KITCHEN_PHOTO_2)) &&
            (!Objects.equals(existing.details().kitchenName(),details.kitchenName()) ||
             !Objects.equals(existing.details().addressLine1(),details.addressLine1()) ||
             !Objects.equals(existing.details().city(),details.city()) ||
             !Objects.equals(existing.details().state(),details.state()) ||
             !Objects.equals(existing.details().latitude(),details.latitude()) ||
             !Objects.equals(existing.details().longitude(),details.longitude())))
            throw ApiException.conflict("REVIEWED_KITCHEN_LOCKED","Contact support before changing an already reviewed kitchen.");
        if(existing!=null && docs.stream().anyMatch(d -> d.documentType()==KycDocumentType.FSSAI_LICENSE &&
            "APPROVED".equals(d.status())) && !Objects.equals(existing.details().fssaiNumber(),details.fssaiNumber()))
            throw ApiException.conflict("REVIEWED_FSSAI_LOCKED","Contact support before changing an approved FSSAI number.");
        UUID applicationId=application.id();
        if(ChefOnboardingPolicy.kitchenComplete(details)) {
            if(applicationId==null) {
                applicationId=UUID.randomUUID();
                jdbc.update("""
                    INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,
                        address_line1,address_line2,landmark,city,state,postal_code,latitude,longitude)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,applicationId,user.identityId(),user.phoneNumber(),email,details.firstName(),details.lastName(),
                    details.addressLine1(),details.addressLine2(),details.landmark(),details.city(),details.state(),
                    details.postalCode(),details.latitude(),details.longitude());
            } else {
                jdbc.update("""
                    UPDATE chef_application SET phone_number=?,email=?,first_name=?,last_name=?,address_line1=?,
                        address_line2=?,landmark=?,city=?,state=?,postal_code=?,latitude=?,longitude=?,
                        status='PENDING',rejection_reason=NULL,reviewed_at=NULL,reviewed_by_identity_id=NULL,updated_at=now()
                    WHERE id=? AND status <> 'APPROVED'
                    """,user.phoneNumber(),email,details.firstName(),details.lastName(),details.addressLine1(),
                    details.addressLine2(),details.landmark(),details.city(),details.state(),details.postalCode(),
                    details.latitude(),details.longitude(),applicationId);
            }
        }
        if(existing==null) {
            jdbc.update("INSERT INTO chef_onboarding_draft(identity_id,application_id,details) VALUES (?,?,?::jsonb)",
                user.identityId(),applicationId,encode(details));
        } else {
            jdbc.update("""
                UPDATE chef_onboarding_draft SET details=?::jsonb,application_id=?,submitted=false,
                    version=version+1,updated_at=now() WHERE identity_id=?
                """,encode(details),applicationId,user.identityId());
        }
        return mine(user);
    }

    @Transactional
    public State submit(CurrentUser user, Long expectedVersion) {
        requireEnabled(); requireApplicant(user); lock(user);
        var draft=find(user.identityId(),true);
        if(draft==null || expectedVersion==null || expectedVersion!=draft.version())
            throw ApiException.conflict("ONBOARDING_VERSION_CHANGED","Reload your application before submitting.");
        var state=mine(user);
        if(state.legacy()) throw ApiException.conflict("CHEF_EXISTING_APPLICATION","Use your existing Chef application.");
        auth.requireVerifiedEmail(user.identityId(),draft.details().email());
        if(!"review".equals(ChefOnboardingPolicy.resume(draft.details(),state.documents(),false)))
            throw ApiException.conflict("ONBOARDING_INCOMPLETE","Complete the kitchen photos, FSSAI document and selected proof before submitting.");
        if(!state.submitted()) {
            jdbc.update("UPDATE chef_onboarding_draft SET submitted=true,version=version+1,updated_at=now() WHERE identity_id=?",user.identityId());
            jdbc.update("UPDATE chef_application SET status='PENDING',rejection_reason=NULL,reviewed_at=NULL,reviewed_by_identity_id=NULL,submitted_at=now(),updated_at=now() WHERE identity_id=? AND status<>'APPROVED'",user.identityId());
        }
        return mine(user);
    }

    public State review(CurrentUser admin,UUID applicationId) {
        requireAdmin(admin);
        var application=applications.getApplicationForAdmin(admin,applicationId);
        var draft=find(application.identityId(),false);
        var docs=applications.listApplicationEvidenceForAdmin(admin,applicationId);
        Details details=draft==null ? null : draft.details();
        return new State(enabled,draft==null,draft==null?0:draft.version(),"review",draft!=null&&draft.submitted(),
            application.phoneNumber(),details,application,docs,
            (draft==null ? java.util.Set.of(KycDocumentType.APPLICANT_PHOTO,KycDocumentType.GOVERNMENT_ID_FRONT,
                KycDocumentType.GOVERNMENT_ID_BACK,KycDocumentType.TAX_ID_CARD)
                : ChefOnboardingPolicy.required(details.proofKind())).stream().map(Enum::name).sorted().toList(),
            supportPhone,supportEmail);
    }

    @Transactional
    public Help requestHelp(CurrentUser user,HelpRequest request) {
        requireEnabled(); requireApplicant(user); lock(user);
        var draft=find(user.identityId(),true);
        if(draft==null) throw ApiException.conflict("ONBOARDING_DETAILS_REQUIRED","Save your personal details first.");
        if(applications.getMyApplication(user).status()==ChefApplicationStatus.APPROVED)
            throw ApiException.conflict("CHEF_ALREADY_APPROVED","Use your usual Chef support options.");
        if(request==null || request.requestKey()==null || request.message()==null ||
            request.message().trim().length()<3 || request.message().length()>2000)
            throw ApiException.badRequest("HELP_REQUEST_INVALID","Explain the help you need using 3 to 2000 characters.");
        var same=jdbc.query("SELECT * FROM chef_onboarding_help WHERE identity_id=? AND (request_key=? OR status<>'RESOLVED') ORDER BY created_at DESC LIMIT 1",
            this::mapHelp,user.identityId(),request.requestKey());
        if(!same.isEmpty()) return same.getFirst();
        Details details=draft.details();
        String message="FSSAI application assistance\nName: "+details.firstName()+" "+details.lastName()+
            "\nPhone: "+user.phoneNumber()+"\nEmail: "+details.email()+"\nPreferred language: "+details.language()+
            "\nKitchen: "+Objects.toString(details.kitchenName(),"Not saved")+
            "\nLocation: "+Objects.toString(details.city(),"")+" "+Objects.toString(details.state(),"")+
            "\nRequest: "+request.message().trim();
        var supportCase=support.create(user,new CreateSupportCaseRequest(null,null,"Chef onboarding: FSSAI assistance",message)).supportCase();
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO chef_onboarding_help(id,identity_id,request_key,support_case_id,case_number,phone_number,details,message)
            VALUES (?,?,?,?,?,?,?::jsonb,?)
            """,id,user.identityId(),request.requestKey(),supportCase.id(),supportCase.caseNumber(),user.phoneNumber(),
            encode(details),request.message().trim());
        return jdbc.query("SELECT * FROM chef_onboarding_help WHERE id=?",this::mapHelp,id).getFirst();
    }

    public HelpPage helpRequests(CurrentUser admin,String cursor) {
        requireAdmin(admin);
        List<Help> rows;
        if(cursor==null || cursor.isBlank()) {
            rows=jdbc.query("SELECT * FROM chef_onboarding_help ORDER BY created_at DESC,id DESC LIMIT 101",this::mapHelp);
        } else {
            try {
                if(cursor.length()>120) throw new IllegalArgumentException();
                String[] parts=cursor.split("\\|",-1);
                if(parts.length!=2) throw new IllegalArgumentException();
                java.time.Instant time=java.time.Instant.parse(parts[0]); UUID id=UUID.fromString(parts[1]);
                rows=jdbc.query("SELECT * FROM chef_onboarding_help WHERE (created_at,id)<(?,?) ORDER BY created_at DESC,id DESC LIMIT 101",
                    this::mapHelp,java.sql.Timestamp.from(time),id);
            } catch(IllegalArgumentException ex) {
                throw ApiException.badRequest("HELP_CURSOR_INVALID","Reload the support requests.");
            }
        }
        boolean more=rows.size()>100; List<Help> page=more?rows.subList(0,100):rows;
        Help last=page.isEmpty()?null:page.getLast();
        return new HelpPage(page,more?last.createdAt()+"|"+last.id():null);
    }
    @Transactional
    public Help updateHelp(CurrentUser admin,UUID id,HelpStatusRequest request) {
        requireAdmin(admin);
        if(request==null || !java.util.Set.of("OPEN","CONTACTED","RESOLVED").contains(Objects.toString(request.status(),"")))
            throw ApiException.badRequest("HELP_STATUS_INVALID","Choose a valid request status.");
        var rows=jdbc.query("SELECT * FROM chef_onboarding_help WHERE id=? FOR UPDATE",this::mapHelp,id);
        if(rows.isEmpty()) throw ApiException.notFound("HELP_NOT_FOUND","Help request was not found.");
        Help previous=rows.getFirst();
        if(!previous.status().equals(request.status())) {
            if("RESOLVED".equals(previous.status()) && !"RESOLVED".equals(request.status()))
                throw ApiException.conflict("HELP_ALREADY_RESOLVED","Resolved help requests remain in history.");
            jdbc.update("UPDATE chef_onboarding_help SET status=?,reviewed_by=?,reviewed_at=now() WHERE id=?",request.status(),admin.identityId(),id);
            jdbc.update("INSERT INTO chef_onboarding_help_audit(id,help_id,actor_id,old_status,new_status) VALUES (?,?,?,?,?)",
                UUID.randomUUID(),id,admin.identityId(),previous.status(),request.status());
        }
        return jdbc.query("SELECT * FROM chef_onboarding_help WHERE id=?",this::mapHelp,id).getFirst();
    }

    private void lock(CurrentUser user) {
        emailProjection.lockIdentity(user.identityId());
        jdbc.query("SELECT id FROM chef_application WHERE identity_id=? FOR UPDATE",(rs,row)->rs.getObject(1,UUID.class),user.identityId());
    }
    private Draft find(UUID identityId,boolean lock) {
        var rows=jdbc.query("SELECT details,version,submitted FROM chef_onboarding_draft WHERE identity_id=?"+(lock?" FOR UPDATE":""),
            (rs,row)->new Draft(decode(rs.getString("details")),rs.getLong("version"),rs.getBoolean("submitted")),identityId);
        return rows.isEmpty()?null:rows.getFirst();
    }
    private Help mapHelp(ResultSet rs,int row)throws SQLException {
        return new Help(rs.getObject("id",UUID.class),rs.getString("case_number"),rs.getObject("support_case_id",UUID.class),
            rs.getObject("identity_id",UUID.class),decode(rs.getString("details")),rs.getString("phone_number"),
            rs.getString("message"),rs.getString("status"),rs.getTimestamp("created_at").toInstant());
    }
    private Details decode(String value) {
        try { return json.readValue(value,Details.class); }
        catch(Exception e) { throw ApiException.conflict("ONBOARDING_STATE_UNAVAILABLE","Your saved details could not be read. Contact support."); }
    }
    private String encode(Details value) {
        try { return json.writeValueAsString(value); }
        catch(Exception e) { throw new IllegalStateException("Cannot encode onboarding details"); }
    }
    private static String trim(String value) { return value==null || value.isBlank()?null:value.trim(); }
    private void requireEnabled() {
        if(!enabled) throw ApiException.notFound("ONBOARDING_NOT_ENABLED","The new Chef onboarding flow is not enabled.");
    }
    static void requireApplicant(CurrentUser user) {
        if(user==null || user.identityId()==null || user.phoneNumber()==null || !user.hasAnyRole("CUSTOMER","CHEF"))
            throw ApiException.forbidden("APPLICANT_ACCESS_REQUIRED","Sign in with your verified Craves phone number.");
    }
    static void requireAdmin(CurrentUser user) {
        if(user==null || !user.hasAnyRole("PLATFORM_ADMIN","CHEF_ADMIN","COMPLIANCE_ADMIN"))
            throw ApiException.forbidden("ONBOARDING_ADMIN_REQUIRED","Chef onboarding administrator access is required.");
    }
    static void requireEditor(CurrentUser user) {
        if(user==null || !user.hasAnyRole("PLATFORM_ADMIN","CHEF_ADMIN"))
            throw ApiException.forbidden("ONBOARDING_EDITOR_REQUIRED","Chef onboarding editor access is required.");
    }
    private record Draft(Details details,long version,boolean submitted) {}
}
