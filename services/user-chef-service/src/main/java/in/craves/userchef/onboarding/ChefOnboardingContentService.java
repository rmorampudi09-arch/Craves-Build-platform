package in.craves.userchef.onboarding;

import com.azure.storage.blob.models.BlobRequestConditions;
import com.azure.storage.blob.options.BlobInputStreamOptions;
import com.azure.storage.blob.sas.BlobSasPermission;
import com.azure.storage.blob.sas.BlobServiceSasSignatureValues;
import com.azure.storage.common.sas.SasProtocol;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.BlobDocumentStorageService;
import java.io.InputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;

@Service
public class ChefOnboardingContentService {
    private final JdbcTemplate jdbc;
    private final BlobDocumentStorageService storage;
    public ChefOnboardingContentService(JdbcTemplate jdbc,BlobDocumentStorageService storage) {
        this.jdbc=jdbc; this.storage=storage;
    }
    public List<Content> published(CurrentUser user,String language) {
        ChefOnboardingService.requireApplicant(user); language(language);
        return jdbc.query("SELECT * FROM chef_onboarding_content WHERE published=true AND ready=true AND language=? ORDER BY created_at DESC LIMIT 50",
            this::map,language);
    }
    public List<Content> list(CurrentUser admin) {
        ChefOnboardingService.requireAdmin(admin);
        return jdbc.query("SELECT * FROM chef_onboarding_content ORDER BY created_at DESC LIMIT 100",this::map);
    }
    @Transactional
    public UploadTicket create(CurrentUser admin,ContentRequest request) {
        ChefOnboardingService.requireEditor(admin);
        if(request==null) throw ApiException.badRequest("CONTENT_REQUIRED","Enter the learning content.");
        language(request.language());
        if(request.title()==null || request.title().isBlank() || request.title().length()>160)
            throw ApiException.badRequest("CONTENT_TITLE_INVALID","Enter a title with at most 160 characters.");
        String kind=Objects.toString(request.kind(),"");
        if(!Set.of("ARTICLE","VIDEO").contains(kind)) throw ApiException.badRequest("CONTENT_KIND_INVALID","Choose article or video.");
        boolean article="ARTICLE".equals(kind);
        if(article && (request.body()==null || request.body().trim().length()<10 || request.body().length()>20000))
            throw ApiException.badRequest("ARTICLE_INVALID","Enter an article with 10 to 20000 characters.");
        if(!article && (!Set.of("video/mp4","video/webm").contains(Objects.toString(request.contentType(),"")) ||
            request.fileSizeBytes()==null || request.fileSizeBytes()<1 || request.fileSizeBytes()>104857600))
            throw ApiException.badRequest("VIDEO_INVALID","Choose an MP4 or WebM video no larger than 100 MB.");
        if(jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_content WHERE created_by=? AND created_at>now()-interval '1 hour'",Integer.class,admin.identityId())>=30)
            throw ApiException.conflict("CONTENT_UPLOAD_LIMIT","Wait before creating more content.");
        UUID id=UUID.randomUUID();
        String blob=article?null:"onboarding-learning/"+id+"/video";
        Instant expires=article?null:Instant.now().plusSeconds(900);
        String uploadUrl=null;
        if(!article) {
            try {
                var client=storage.privateDocumentsContainer().getBlobClient(blob);
                // Create-only: the browser cannot overwrite a successfully uploaded/published video.
                var values=new BlobServiceSasSignatureValues(OffsetDateTime.now().plusMinutes(15),
                    new BlobSasPermission().setCreatePermission(true))
                    .setStartTime(OffsetDateTime.now().minusMinutes(1)).setProtocol(SasProtocol.HTTPS_ONLY);
                uploadUrl=client.getBlobUrl()+"?"+client.generateSas(values);
            } catch(ApiException ex) { throw ex; }
            catch(Exception ex) { throw ApiException.conflict("VIDEO_UPLOAD_UNAVAILABLE","Secure video upload is unavailable."); }
        }
        jdbc.update("""
            INSERT INTO chef_onboarding_content(id,language,title,kind,body,blob_name,content_type,file_size_bytes,
                ready,created_by,updated_by,upload_expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,id,request.language(),request.title().trim(),kind,article?request.body().trim():null,blob,
            article?null:request.contentType(),article?null:request.fileSizeBytes(),article,admin.identityId(),
            admin.identityId(),expires==null?null:java.sql.Timestamp.from(expires));
        audit(id,admin.identityId(),"CREATED",1);
        return new UploadTicket(get(id),uploadUrl,expires);
    }
    @Transactional
    public Content finalizeUpload(CurrentUser admin,UUID id) {
        ChefOnboardingService.requireEditor(admin);
        var rows=jdbc.query("SELECT created_by,blob_name FROM chef_onboarding_content WHERE id=? FOR UPDATE",
            (rs,row)->new Target(rs.getObject("created_by",UUID.class),rs.getString("blob_name")),id);
        if(rows.isEmpty()) throw ApiException.notFound("CONTENT_NOT_FOUND","Content was not found.");
        var target=rows.getFirst(); var content=get(id);
        if(!target.owner().equals(admin.identityId()) && !admin.hasRole("PLATFORM_ADMIN"))
            throw ApiException.forbidden("CONTENT_OWNER_REQUIRED","Only the uploading editor or platform administrator can finalize this video.");
        if(content.ready()) return content;
        if(!"VIDEO".equals(content.kind())) throw ApiException.badRequest("VIDEO_REQUIRED","This content is not a video.");
        try {
            var client=storage.privateDocumentsContainer().getBlobClient(target.blob());
            var properties=client.getProperties();
            if(properties.getBlobSize()!=content.fileSizeBytes() || !content.contentType().equals(properties.getContentType()))
                throw ApiException.badRequest("VIDEO_UPLOAD_MISMATCH","The uploaded video does not match the declared format or size.");
            try(InputStream stream=client.openInputStream(new BlobInputStreamOptions().setRequestConditions(
                new BlobRequestConditions().setIfMatch(properties.getETag())))) {
                if(!validVideoSignature(content.contentType(),stream.readNBytes(64)))
                    throw ApiException.badRequest("VIDEO_SIGNATURE_INVALID","Choose an original MP4 or WebM video.");
            }
        } catch(ApiException ex) { throw ex; }
        catch(Exception ex) { throw ApiException.conflict("VIDEO_UPLOAD_INCOMPLETE","The complete video could not be verified. Check the upload."); }
        jdbc.update("UPDATE chef_onboarding_content SET ready=true,version=version+1,updated_by=?,updated_at=now() WHERE id=?",admin.identityId(),id);
        var ready=get(id); audit(id,admin.identityId(),"UPLOAD_VERIFIED",ready.version()); return ready;
    }
    @Transactional
    public Content publish(CurrentUser admin,UUID id,PublishRequest request) {
        ChefOnboardingService.requireEditor(admin);
        jdbc.query("SELECT id FROM chef_onboarding_content WHERE id=? FOR UPDATE",(rs,row)->rs.getObject(1,UUID.class),id);
        var content=get(id);
        if(request==null || request.expectedVersion()==null || request.expectedVersion()!=content.version())
            throw ApiException.conflict("CONTENT_VERSION_CHANGED","Reload the content before changing its publication.");
        if(request.published() && !content.ready()) throw ApiException.conflict("CONTENT_NOT_READY","Verify the complete video before publishing.");
        if(content.published()!=request.published()) {
            jdbc.update("UPDATE chef_onboarding_content SET published=?,version=version+1,updated_by=?,updated_at=now() WHERE id=?",
                request.published(),admin.identityId(),id);
            content=get(id); audit(id,admin.identityId(),request.published()?"PUBLISHED":"UNPUBLISHED",content.version());
        }
        return content;
    }
    public Playback playback(CurrentUser user,UUID id,boolean admin) {
        if(admin) ChefOnboardingService.requireAdmin(user); else ChefOnboardingService.requireApplicant(user);
        var content=get(id);
        if(!content.ready() || !admin && !content.published() || !"VIDEO".equals(content.kind()))
            throw ApiException.notFound("CONTENT_NOT_FOUND","Published video was not found.");
        String blob=jdbc.queryForObject("SELECT blob_name FROM chef_onboarding_content WHERE id=?",String.class,id);
        try {
            var client=storage.privateDocumentsContainer().getBlobClient(blob);
            OffsetDateTime expires=OffsetDateTime.now().plusMinutes(10);
            var values=new BlobServiceSasSignatureValues(expires,new BlobSasPermission().setReadPermission(true))
                .setStartTime(OffsetDateTime.now().minusMinutes(1)).setProtocol(SasProtocol.HTTPS_ONLY)
                .setContentType(content.contentType()).setCacheControl("private, no-store");
            return new Playback(client.getBlobUrl()+"?"+client.generateSas(values),expires.toInstant());
        } catch(ApiException ex) { throw ex; }
        catch(Exception ex) { throw ApiException.conflict("VIDEO_PLAYBACK_UNAVAILABLE","Secure video playback is unavailable."); }
    }
    static boolean validVideoSignature(String type,byte[] bytes) {
        if("video/mp4".equals(type)) return bytes.length>=12 && bytes[4]=='f' && bytes[5]=='t' && bytes[6]=='y' && bytes[7]=='p';
        return "video/webm".equals(type) && bytes.length>=4 && bytes[0]==(byte)0x1a && bytes[1]==(byte)0x45 &&
            bytes[2]==(byte)0xdf && bytes[3]==(byte)0xa3;
    }
    private Content get(UUID id) {
        var rows=jdbc.query("SELECT * FROM chef_onboarding_content WHERE id=?",this::map,id);
        if(rows.isEmpty()) throw ApiException.notFound("CONTENT_NOT_FOUND","Content was not found.");
        return rows.getFirst();
    }
    private Content map(ResultSet rs,int row)throws SQLException {
        Long size=rs.getObject("file_size_bytes")==null?null:rs.getLong("file_size_bytes");
        return new Content(rs.getObject("id",UUID.class),rs.getString("language"),rs.getString("title"),rs.getString("kind"),
            rs.getString("body"),rs.getBoolean("published"),rs.getBoolean("ready"),rs.getLong("version"),
            rs.getString("content_type"),size,rs.getTimestamp("created_at").toInstant());
    }
    private static void language(String value) {
        if(value==null || !ChefOnboardingPolicy.LANGUAGES.contains(value))
            throw ApiException.badRequest("LANGUAGE_INVALID","Choose a supported language.");
    }
    private void audit(UUID id,UUID actor,String action,long version) {
        jdbc.update("INSERT INTO chef_onboarding_content_audit(id,content_id,actor_id,action,version) VALUES (?,?,?,?,?)",
            UUID.randomUUID(),id,actor,action,version);
    }
    private record Target(UUID owner,String blob) {}
}
