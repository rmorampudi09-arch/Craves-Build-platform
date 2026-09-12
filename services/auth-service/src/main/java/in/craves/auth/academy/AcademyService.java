package in.craves.auth.academy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

@Service
public class AcademyService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final AcademyCatalog catalog;
    public AcademyService(JdbcTemplate db, ObjectMapper json, AcademyCatalog catalog) {
        this.db = db; this.json = json; this.catalog = catalog;
    }
    private boolean learner(UUID id, boolean lock) {
        db.update("INSERT INTO academy_schema.learner(identity_id) VALUES (?) ON CONFLICT DO NOTHING", id);
        return Boolean.TRUE.equals(db.queryForObject("SELECT personalized FROM academy_schema.learner WHERE identity_id=?" + (lock ? " FOR UPDATE" : ""), Boolean.class, id));
    }
    private long count(String sql, Object... args) {
        Long value = db.queryForObject(sql, Long.class, args); return value == null ? 0 : value;
    }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Could not encode learning record", e); }
    }
    private JsonNode decode(String value) {
        try { return json.readTree(value); } catch (Exception e) { throw new IllegalStateException("Invalid stored learning record", e); }
    }
    private static ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status, message); }

    @Transactional
    public Map<String, Object> state(UUID id) {
        boolean personalized = learner(id, false);
        var progress = db.queryForList("""
            SELECT course_id AS "courseId",lesson_id AS "lessonId",content_version AS "version",
              best_score AS "bestScore",attempts,mastery,completed_at AS "completedAt",last_attempt_at AS "lastAttemptAt"
            FROM academy_schema.progress WHERE identity_id=? AND content_version=? ORDER BY course_id,lesson_id
            """, id, catalog.version());
        long xp = count("SELECT COALESCE(sum(xp),0) FROM academy_schema.xp_ledger WHERE identity_id=?", id);
        var days = db.queryForList("""
            SELECT day::text AS day FROM (
              SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day FROM academy_schema.attempt WHERE identity_id=?
              UNION SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date FROM academy_schema.activity WHERE identity_id=?
            ) activity_days WHERE day >= (now() AT TIME ZONE 'Asia/Kolkata')::date-90 ORDER BY day DESC
            """, String.class, id, id);
        Set<String> active = new HashSet<>(days);
        LocalDate day = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        if (!active.contains(day.toString())) day = day.minusDays(1);
        int streak = 0;
        while (active.contains(day.toString())) { streak++; day = day.minusDays(1); }
        List<Map<String, Object>> recommendations = new ArrayList<>();
        if (personalized) for (JsonNode course : catalog.courses()) {
            for (JsonNode lesson : course.path("lessons")) {
                String cid = course.path("id").asText(), lid = lesson.path("id").asText();
                var p = progress.stream().filter(v -> cid.equals(v.get("courseId")) && lid.equals(v.get("lessonId"))).findFirst();
                double mastery = p.map(v -> ((Number)v.get("mastery")).doubleValue()).orElse(AcademyLearningModel.INITIAL);
                int attempts = p.map(v -> ((Number)v.get("attempts")).intValue()).orElse(0);
                if (p.isEmpty() || p.get().get("completedAt") == null || mastery < 0.85) {
                    recommendations.add(Map.of("courseId",cid,"lessonId",lid,"title",lesson.path("title").asText(),
                        "mastery",mastery,"reason",AcademyLearningModel.recommendation(mastery,attempts)));
                }
            }
        }
        recommendations.sort(Comparator.comparingDouble(v -> ((Number)v.get("mastery")).doubleValue()));
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("xp",xp); result.put("level",1+xp/300); result.put("progress",progress);
        result.put("personalized",personalized); result.put("streakDays",streak); result.put("activeDays",days);
        result.put("activeSeconds",count("SELECT COALESCE(sum(active_seconds),0) FROM academy_schema.activity WHERE identity_id=?",id));
        result.put("recommendations",recommendations.stream().limit(4).toList());
        result.put("modelVersion",AcademyLearningModel.VERSION);
        result.put("modelNotice","Bayesian practice model with fixed priors, updated from quiz answers. Not calibrated on staff outcomes; not an employee rating. Repeated questions are not independent proof of competence.");
        result.put("telemetryNotice","We record course/section visits, narration starts, bounded active-time heartbeats and quiz outcomes against your Craves identity. No customer payloads, keystrokes, camera, microphone or cross-site tracking. Activity is retained for 90 days; attempt receipts for 365 days. Progress and XP remain until an authorized account-retention decision.");
        return result;
    }

    @Transactional
    public JsonNode submit(UUID id, UUID requestId, String courseId, String lessonId, String version, List<Integer> answers) {
        if (!catalog.version().equals(version)) throw error(HttpStatus.CONFLICT,"Course version changed; reload before submitting");
        JsonNode course = catalog.course(courseId), lesson = catalog.lesson(courseId,lessonId);
        JsonNode questions = lesson.path("questions");
        if (answers == null || answers.size()!=questions.size()) throw error(HttpStatus.BAD_REQUEST,"Answer every question");
        for(int i=0;i<answers.size();i++) if(answers.get(i)==null || answers.get(i)<0 || answers.get(i)>=questions.get(i).path("options").size())
            throw error(HttpStatus.BAD_REQUEST,"Invalid answer option");
        String fingerprint;
        try { fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((version+":"+courseId+":"+lessonId+":"+answers).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
        boolean personalized = learner(id,true); // Serialize all writes for one learner across replicas.
        var existing = db.queryForList("SELECT request_hash,result::text AS result FROM academy_schema.attempt WHERE identity_id=? AND request_id=?",id,requestId);
        if (!existing.isEmpty()) {
            if (!fingerprint.equals(existing.get(0).get("request_hash"))) throw error(HttpStatus.CONFLICT,"Request ID was already used for different answers");
            return decode((String)existing.get(0).get("result"));
        }
        if (count("SELECT count(*) FROM academy_schema.attempt WHERE identity_id=? AND course_id=? AND lesson_id=? AND created_at>now()-interval '30 seconds'",id,courseId,lessonId)>0)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Review the feedback before retrying; wait 30 seconds");
        if (count("SELECT count(*) FROM academy_schema.attempt WHERE identity_id=? AND created_at>now()-interval '1 day'",id)>=200)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Daily practice limit reached");
        var rows = db.queryForList("SELECT mastery FROM academy_schema.progress WHERE identity_id=? AND course_id=? AND lesson_id=? AND content_version=?",id,courseId,lessonId,version);
        double mastery = rows.isEmpty()?AcademyLearningModel.INITIAL:((Number)rows.get(0).get("mastery")).doubleValue();
        List<Map<String,Object>> feedback = new ArrayList<>(); int correct = 0;
        for(int i=0;i<answers.size();i++) {
            JsonNode question=questions.get(i); boolean right=answers.get(i)==question.path("answer").asInt();
            if(right)correct++;
            if(personalized)mastery=AcademyLearningModel.update(mastery,right);
            feedback.add(Map.of("questionId",question.path("id").asText(),"correct",right,
                "answer",question.path("answer").asInt(),"explanation",question.path("explanation").asText()));
        }
        int score=AcademyLearningModel.score(correct,answers.size()); boolean passed=score>=80;
        db.update("""
            INSERT INTO academy_schema.progress(identity_id,course_id,lesson_id,content_version,best_score,attempts,mastery,completed_at,last_attempt_at)
            VALUES (?,?,?,?,?,1,?,CASE WHEN ? THEN now() ELSE NULL END,now())
            ON CONFLICT(identity_id,course_id,lesson_id,content_version) DO UPDATE SET
              best_score=GREATEST(academy_schema.progress.best_score,excluded.best_score),
              attempts=academy_schema.progress.attempts+1,mastery=excluded.mastery,
              completed_at=COALESCE(academy_schema.progress.completed_at,excluded.completed_at),last_attempt_at=now()
            """,id,courseId,lessonId,version,score,mastery,passed);
        int earned=0;
        if(passed) {
            earned+=40*db.update("INSERT INTO academy_schema.xp_ledger(identity_id,reward_key,xp) VALUES (?,?,40) ON CONFLICT DO NOTHING",id,version+":lesson:"+courseId+":"+lessonId);
            if(count("SELECT count(*) FROM academy_schema.progress WHERE identity_id=? AND course_id=? AND content_version=? AND completed_at IS NOT NULL",id,courseId,version)==course.path("lessons").size())
                earned+=120*db.update("INSERT INTO academy_schema.xp_ledger(identity_id,reward_key,xp) VALUES (?,?,120) ON CONFLICT DO NOTHING",id,version+":course:"+courseId);
        }
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("requestId",requestId);result.put("score",score);result.put("passed",passed);result.put("earnedXp",earned);
        result.put("feedback",feedback);result.put("mastery",personalized?mastery:null);result.put("modelVersion",AcademyLearningModel.VERSION);
        String encoded=encode(result);
        db.update("INSERT INTO academy_schema.attempt(identity_id,request_id,course_id,lesson_id,content_version,request_hash,result) VALUES (?,?,?,?,?,?,?::jsonb)",id,requestId,courseId,lessonId,version,fingerprint,encoded);
        return decode(encoded);
    }

    @Transactional
    public void event(UUID id, UUID requestId, String courseId, String lessonId, String kind) {
        catalog.lesson(courseId,lessonId);
        if(!Set.of("LESSON_OPEN","NARRATION_PLAY","ACTIVE_HEARTBEAT").contains(kind))throw error(HttpStatus.BAD_REQUEST,"Unsupported learning activity");
        learner(id,true);
        if(count("SELECT count(*) FROM academy_schema.activity WHERE identity_id=? AND request_id=?",id,requestId)>0)return;
        if(count("SELECT count(*) FROM academy_schema.activity WHERE identity_id=? AND created_at>now()-interval '1 minute'",id)>=20)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Activity rate limit reached");
        int seconds=0;
        if("ACTIVE_HEARTBEAT".equals(kind)) {
            var elapsed=db.queryForList("""
                SELECT EXTRACT(EPOCH FROM(now()-created_at)) AS elapsed FROM academy_schema.activity
                WHERE identity_id=? AND kind='ACTIVE_HEARTBEAT' ORDER BY created_at DESC LIMIT 1
                """,id);
            if(!elapsed.isEmpty()) {
                double value=((Number)elapsed.get(0).get("elapsed")).doubleValue();
                if(value<25)return; // Suppress duplicate tabs and forged rapid heartbeats.
                if(value<=60)seconds=(int)Math.min(30,value);
            }
        }
        db.update("INSERT INTO academy_schema.activity(identity_id,request_id,course_id,lesson_id,kind,active_seconds) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING",id,requestId,courseId,lessonId,kind,seconds);
    }
    @Transactional
    public void preferences(UUID id, boolean personalized) {
        learner(id,true);
        db.update("UPDATE academy_schema.learner SET personalized=?,updated_at=now() WHERE identity_id=?",personalized,id);
        if(!personalized)db.update("UPDATE academy_schema.progress SET mastery=? WHERE identity_id=?",AcademyLearningModel.INITIAL,id);
        audit(id,personalized?"PERSONALIZATION_ENABLED":"PERSONALIZATION_DISABLED",null);
    }
    public List<Map<String,Object>> plans() {
        return db.queryForList("SELECT id,title,service,details,status,revision,updated_at AS \"updatedAt\" FROM academy_schema.roadmap ORDER BY updated_at DESC LIMIT 200");
    }
    @Transactional
    public void savePlan(UUID actor, UUID id, String title, String service, String details, String status, int expectedRevision) {
        if(!Set.of("PROPOSED","APPROVED","IN_PROGRESS","SHIPPED").contains(status))throw error(HttpStatus.BAD_REQUEST,"Invalid roadmap status");
        if(!"platform".equals(service))catalog.course(service);
        int updated;
        if(expectedRevision==0) {
            if(count("SELECT count(*) FROM academy_schema.roadmap")>=200)throw error(HttpStatus.CONFLICT,"Roadmap capacity reached; revise existing entries");
            updated=db.update("INSERT INTO academy_schema.roadmap(id,title,service,details,status,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING",id,title.trim(),service,details.trim(),status,actor);
        } else updated=db.update("UPDATE academy_schema.roadmap SET title=?,service=?,details=?,status=?,revision=revision+1,updated_by=?,updated_at=now() WHERE id=? AND revision=?",title.trim(),service,details.trim(),status,actor,id,expectedRevision);
        if(updated!=1)throw error(HttpStatus.CONFLICT,"Plan changed; reload before saving");
        audit(actor,"ROADMAP_SAVED",id);
    }
    @Transactional
    public void deletePlan(UUID actor,UUID id,int revision) {
        if(db.update("DELETE FROM academy_schema.roadmap WHERE id=? AND revision=?",id,revision)!=1)throw error(HttpStatus.CONFLICT,"Plan changed; reload before deleting");
        audit(actor,"ROADMAP_DELETED",id);
    }
    @Transactional
    public Map<String,Object> analytics(UUID actor,int page) {
        audit(actor,"TEAM_REPORT_READ",null);
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("totalLearners",count("SELECT count(*) FROM academy_schema.learner"));
        result.put("totalXp",count("SELECT COALESCE(sum(xp),0) FROM academy_schema.xp_ledger"));
        result.put("completedSections",count("SELECT count(*) FROM academy_schema.progress WHERE content_version=? AND completed_at IS NOT NULL",catalog.version()));
        result.put("page",page);result.put("pageSize",50);
        result.put("learners",db.queryForList("""
          SELECT 'Learner-'||substring(md5(l.identity_id::text),1,10) AS learner,
            COALESCE((SELECT sum(xp) FROM academy_schema.xp_ledger x WHERE x.identity_id=l.identity_id),0) AS xp,
            (SELECT count(*) FROM academy_schema.progress p WHERE p.identity_id=l.identity_id AND content_version=? AND completed_at IS NOT NULL) AS completed,
            (SELECT max(last_attempt_at) FROM academy_schema.progress p WHERE p.identity_id=l.identity_id) AS "lastPractice"
          FROM academy_schema.learner l ORDER BY l.created_at DESC,l.identity_id LIMIT 50 OFFSET ?
          """,catalog.version(),page*50));
        result.put("daily",db.queryForList("""
          SELECT d.day::date::text AS day,COALESCE(a.events,0) AS events,COALESCE(a.active,0) AS "activeSeconds"
          FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date-29,(now() AT TIME ZONE 'Asia/Kolkata')::date,interval '1 day') d(day)
          LEFT JOIN (SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS events,sum(active_seconds) AS active
            FROM academy_schema.activity WHERE created_at>now()-interval '31 days' GROUP BY 1) a ON a.day=d.day::date ORDER BY d.day
          """));
        result.put("notice","Pseudonymous learning activity only. Active time is an estimate, not proof of attention. Do not use these records or the uncalibrated practice model to rank staff performance.");
        return result;
    }
    public void audit(UUID actor,String action,UUID target) {
        db.update("INSERT INTO academy_schema.audit(actor_id,action,target_id) VALUES (?,?,?)",actor,action,target);
    }
    @Transactional
    public void retention() {
        Boolean locked=db.queryForObject("SELECT pg_try_advisory_xact_lock(2026091301)",Boolean.class);
        if(!Boolean.TRUE.equals(locked))return;
        db.update("DELETE FROM academy_schema.activity WHERE created_at<now()-interval '90 days'");
        db.update("DELETE FROM academy_schema.attempt WHERE created_at<now()-interval '365 days'");
        db.update("DELETE FROM academy_schema.audit WHERE created_at<now()-interval '365 days'");
    }
}
