"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Code2, Flame, GraduationCap, Layers3, Lightbulb, LockKeyhole, Play, Pause, Search, ShieldCheck, Sparkles, Target, Trophy, Volume2, RefreshCw, WifiOff } from "lucide-react";
import { AcademyRequestError, parseRetryAfter } from "@/lib/academy-ux-state";
import { adminFetch } from "@/lib/admin-renewal";
import { AcademyDeleteDialog, AcademyErrorState, AcademyNotice, AcademySkeleton, useAcademyConnection } from "./academy-ui";
import type { Catalog, Course, Learner, Lesson, Plan, QuizResult, Report } from "./academy-types";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await adminFetch(`/api/admin/academy/${path}`, { method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new AcademyRequestError(response.status, parseRetryAfter(response.headers.get("Retry-After")));
    return data as T;
  } finally { clearTimeout(timer); }
}
const pct = (course: Course, me: Learner) => Math.round(100 * course.lessons.filter(l => me.progress.some(p => p.courseId === course.id && p.lessonId === l.id && p.completedAt)).length / course.lessons.length);
const short = (value: string) => value.replace("-service", "").replace("customer-web-next", "Web & release").replaceAll("-", " ");
function activity(courseId: string, lessonId: string, kind: string) {
  return api("events", "POST", { requestId: crypto.randomUUID(), courseId, lessonId, kind });
}

export default function AcademyDashboard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null), [me, setMe] = useState<Learner | null>(null);
  const [error, setError] = useState<unknown>(null); const [view, setView] = useState("library");
  const online = useAcademyConnection();
  const libraryScroll = useRef(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<unknown>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [search, setSearch] = useState(""), [service, setService] = useState("all"), [sort, setSort] = useState("path");
  const [courseId, setCourseId] = useState(""), [lessonId, setLessonId] = useState("");
  const refresh = useCallback(async () => { setMe(await api<Learner>("me")); setLastSynced(new Date()); }, []);
  const load = useCallback(async () => {
    setError("");
    try {
      const [nextCatalog, nextMe] = await Promise.all([api<Catalog>("catalog"), api<Learner>("me")]);
      if (!Array.isArray(nextCatalog?.courses) || !Array.isArray(nextMe?.progress)) throw new Error("Academy returned an invalid response.");
      setCatalog(nextCatalog); setMe(nextMe); setLastSynced(new Date());
      const params = new URLSearchParams(window.location.search);
      const course = nextCatalog.courses.find(c => c.id === params.get("course"));
      if (course) { setCourseId(course.id); setLessonId(course.lessons.find(l => l.id === params.get("lesson"))?.id || course.lessons[0].id); setView("learn"); }
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function open(course: Course, lesson?: Lesson) {
    if (view === "library") libraryScroll.current = window.scrollY;
    const next = lesson || course.lessons.find(l => !me?.progress.some(p => p.lessonId === l.id && p.completedAt)) || course.lessons[0];
    setCourseId(course.id); setLessonId(next.id); setView("learn");
    window.history.replaceState(null, "", `/admin/academy?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(next.id)}`);
    requestAnimationFrame(() => document.getElementById("ca-content")?.focus({ preventScroll: true }));
  }
  function changeView(next: string) {
    if (view === "library") libraryScroll.current = window.scrollY;
    setView(next);
    if (next !== "learn") window.history.replaceState(null, "", "/admin/academy");
    requestAnimationFrame(() => {
      document.getElementById("ca-content")?.focus({ preventScroll: true });
      if (next === "library") window.scrollTo({ top: libraryScroll.current, behavior: "instant" });
    });
  }
  async function syncProgress() {
    setSyncBusy(true); setSyncError(null);
    try { await refresh(); } catch (e) { setSyncError(e); } finally { setSyncBusy(false); }
  }
  if (!catalog || !me) return <div className="ca-root">{error ? <AcademyErrorState error={error} onRetry={() => void load()} /> : <AcademySkeleton />}</div>;
  const course = catalog.courses.find(c => c.id === courseId);
  const lesson = course?.lessons.find(l => l.id === lessonId);
  const complete = me.progress.filter(p => p.completedAt).length;
  const total = catalog.courses.reduce((n, c) => n + c.lessons.length, 0);
  const recommended = catalog.courses.find(c => c.id === me.recommendations[0]?.courseId) || catalog.courses.find(c => pct(c, me) < 100) || catalog.courses[0];
  const filtered = catalog.courses.filter(c => (service === "all" || c.service === service) && `${c.title} ${c.description} ${c.service} ${c.lessons.map(l => l.title).join(" ")}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "az" ? a.title.localeCompare(b.title) : sort === "short" ? a.minutes - b.minutes : sort === "progress" ? pct(b, me) - pct(a, me) : catalog.courses.indexOf(a) - catalog.courses.indexOf(b));
  return <div className="ca-root">
    <div className="ca-topline"><span><GraduationCap size={17} /> KNOWLEDGE & LEARNING</span><div className="ca-sync"><span className="ca-pill"><LockKeyhole size={12} /> Admin access</span><button className="ca-secondary" disabled={syncBusy || !online} onClick={() => void syncProgress()} aria-label="Refresh learning progress"><RefreshCw size={14} className={syncBusy ? "ca-spin" : ""} />{syncBusy ? "Syncing…" : "Refresh"}</button></div></div>
    <div className="ca-title"><div><h1>One product. A deeper understanding.</h1><p>Learn the product, follow the code, and understand every Craves service.</p></div><span className="ca-version">SOURCE <strong>{catalog.sourceRevision.slice(0, 8)}</strong></span></div>
    <nav className="ca-tabs" aria-label="Academy views">
      <button aria-current={view === "library" ? "page" : undefined} onClick={() => changeView("library")}><BookOpen size={16} /> Course library</button>
      {course && <button aria-current={view === "learn" ? "page" : undefined} onClick={() => setView("learn")}><Play size={16} /> Classroom</button>}
      <button aria-current={view === "plans" ? "page" : undefined} onClick={() => changeView("plans")}><Lightbulb size={16} /> Future plans</button>
      {me.canReport && <button aria-current={view === "insights" ? "page" : undefined} onClick={() => changeView("insights")}><Layers3 size={16} /> Learning insights</button>}
    </nav>
    {Boolean(error) && <AcademyErrorState error={error} compact onRetry={() => void load()} />}
    {!online && <AcademyNotice><WifiOff size={15} />You’re offline. Work on this screen is kept; new changes are not saved yet.</AcademyNotice>}
    {Boolean(syncError) && <AcademyErrorState error={syncError} compact onRetry={() => void syncProgress()} busy={syncBusy} />}
    <div className="ca-sync-label" role="status">{lastSynced ? `Progress loaded at ${lastSynced.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
    <div className="ca-stats">
      <div><span className="ca-stat-icon"><Trophy /></span><p><strong>{me.xp.toLocaleString()} <small>XP</small></strong><span>Earned through quizzes</span></p></div>
      <div><span className="ca-stat-icon"><Target /></span><p><strong>{complete}<small> / {total}</small></strong><span>Sections completed</span></p></div>
      <div><span className="ca-stat-icon"><Flame /></span><p><strong>{me.streakDays}<small> days</small></strong><span>Practice streak · IST</span></p></div>
      <div><span className="ca-stat-icon"><Sparkles /></span><p><strong>Level {me.level}</strong><span>{300 - me.xp % 300} XP to the next level</span></p></div>
    </div>
    <div key={view} id="ca-content" className="ca-view" tabIndex={-1}>
    {view === "library" && <>
      <section className="ca-hero">
        <div><span className="ca-eyebrow"><Sparkles size={13} /> YOUR NEXT CHAPTER</span><h2>From “how it works”<br />to “I understand it.”</h2><p>Start with a Craves scenario, follow the service logic, and put your understanding to the test.</p><button onClick={() => open(recommended)}>{me.progress.length ? "Continue learning" : "Start your learning path"}<ArrowRight size={17} /></button><small>{recommended.title}</small></div>
        <div className="ca-path-art" aria-label="Learning sequence"><span className="ca-orbit ca-orbit-one" /><span className="ca-orbit ca-orbit-two" /><div className="ca-path-card"><span>01</span><BookOpen /><div><b>Understand</b><small>Plain-language walkthroughs</small></div><Check size={17} /></div><div className="ca-path-card"><span>02</span><Code2 /><div><b>Trace the source</b><small>Real files. Pinned revision.</small></div><ArrowRight size={17} /></div><div className="ca-path-card"><span>03</span><Trophy /><div><b>Practise & grow</b><small>Quizzes, feedback and XP</small></div><Sparkles size={17} /></div></div>
      </section>
      <section className="ca-library"><div className="ca-section-title"><div><span className="ca-kicker">BUILT AROUND YOUR PRODUCT</span><h2>Explore the service library <small>{catalog.courses.length}</small></h2></div><label className="ca-sort">Sort by<select value={sort} onChange={e => setSort(e.target.value)}><option value="path">Learning path</option><option value="az">A–Z</option><option value="short">Shortest first</option><option value="progress">Progress</option></select></label></div>
        <div className="ca-tools"><label className="ca-search"><Search size={18} /><input type="search" placeholder="Search a service, concept or course…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search courses" /></label><label className="ca-service-select">Service<select value={service} onChange={e => setService(e.target.value)}><option value="all">All services</option>{[...new Set(catalog.courses.map(c => c.service))].map(s => <option key={s} value={s}>{short(s)}</option>)}</select></label></div>
        <div className="ca-chips"><button aria-pressed={service === "all"} onClick={() => setService("all")}>All services</button>{[...new Set(catalog.courses.map(c => c.service))].map(s => <button key={s} aria-pressed={service === s} onClick={() => setService(s)}>{short(s)}</button>)}</div>
        <p className="ca-result-count" role="status">{filtered.length} {filtered.length === 1 ? "course" : "courses"}{service !== "all" ? ` in ${short(service)}` : " across your product"}</p>
        <div className="ca-course-grid">{filtered.map(c => <article className="ca-course" key={c.id}>
          <div className="ca-course-visual"><span className="ca-service-code">{c.service}</span><div className="ca-code-motif" aria-hidden="true"><Code2 size={44} /><span /><span /><span /></div><span className="ca-course-number">{String(catalog.courses.indexOf(c) + 1).padStart(2, "0")}</span></div>
          <div className="ca-course-content"><div className="ca-course-meta"><span>{c.level}</span><span>{c.minutes} min · {c.lessons.length} sections</span></div><h3>{c.title}</h3><p>{c.description}</p><div className="ca-progress-label"><span>{pct(c, me) === 100 ? "Completed" : pct(c, me) > 0 ? "In progress" : "Ready to explore"}</span><b>{pct(c, me)}%</b></div><progress value={pct(c, me)} max={100} aria-label={`${c.title} progress`} /><button className="ca-course-action" onClick={() => open(c)}>{pct(c, me) === 100 ? "Review course" : pct(c, me) > 0 ? "Continue course" : "Explore course"}<ArrowRight size={17} /></button></div>
        </article>)}</div>
        {!filtered.length && <div className="ca-empty"><Search /><h3>No matching courses</h3><p>Try another service or a broader search term.</p><button onClick={() => { setSearch(""); setService("all"); }}>Reset filters</button></div>}
      </section>
      <section className="ca-bottom-grid"><div className="ca-panel"><span className="ca-kicker">PERSONAL PRACTICE</span><h3>Suggested next steps</h3>{me.personalized ? me.recommendations.length ? me.recommendations.slice(0, 3).map(r => <button className="ca-recommendation" key={r.lessonId} onClick={() => { const c = catalog.courses.find(c => c.id === r.courseId); if (c) open(c, c.lessons.find(l => l.id === r.lessonId)); }}><span><strong>{r.title}</strong><small>{r.reason}</small></span><ArrowRight size={16} /></button>) : <p>You have completed this course version. Revisit a scenario or review a source file.</p> : <p>Personalized suggestions are off. Your courses and earned XP remain available.</p>}</div><div className="ca-panel ca-trust"><ShieldCheck size={28} /><h3>Built for internal learning</h3><p>{catalog.evidenceLabel}</p><p>40 XP per first section pass. 120 XP when all sections in a course are passed. Replays do not create extra rewards.</p><p><strong>{Math.round(me.activeSeconds / 60)} recorded active minutes</strong> · an estimate, not proof of attention.</p></div></section>
    </>}
    {view === "learn" && course && lesson && <div className="ca-classroom"><aside className="ca-syllabus ca-panel"><button className="ca-back" onClick={() => changeView("library")}><ChevronLeft size={15} /> All courses</button><span className="ca-kicker">{course.service}</span><h2>{course.title}</h2><progress max={100} value={pct(course, me)} aria-label="Course progress" /><p>{pct(course, me)}% complete · {course.minutes} min</p><nav aria-label="Course sections">{course.lessons.map((l, i) => <button key={l.id} aria-current={l.id === lesson.id ? "step" : undefined} onClick={() => open(course, l)}><span>{me.progress.some(p => p.lessonId === l.id && p.completedAt) ? <Check size={15} /> : String(i + 1).padStart(2, "0")}</span><strong>{l.title}</strong></button>)}</nav><div className="ca-note"><Code2 size={17} /><p>Code is read-only, loaded through the protected API at revision <b>{catalog.sourceRevision.slice(0, 8)}</b>.</p></div>{course.prerequisites.length > 0 && <p className="ca-prereq">Suggested first: {course.prerequisites.map(id => catalog.courses.find(c => c.id === id)?.title || id).join(" · ")}</p>}</aside><LessonRoom key={lesson.id} course={course} lesson={lesson} catalog={catalog} onProgress={refresh} /></div>}
    {view === "plans" && <Roadmap catalog={catalog} canManage={me.canManage} />}
    {view === "insights" && me.canReport && <Insights />}
    </div>
    <details className="ca-privacy"><summary><ShieldCheck size={15} /> Learning data, personalization & source provenance</summary><p>{me.telemetryNotice}</p><p>{me.modelNotice}</p><p>{catalog.evidenceLabel} Reviewed {catalog.reviewedOn}; source {catalog.sourceRevision}. Published source is public in GitHub; Academy access restrictions do not make the repository private.</p><label><input type="checkbox" checked={me.personalized} onChange={async e => { const enabled = e.target.checked; try { await api("preferences", "PUT", { personalized: enabled }); await refresh(); } catch (e) { setError(e); } }} /> Use my quiz outcomes for personalized revision suggestions. Turning this off resets the practice-model state, not earned XP.</label></details>
    <footer className="ca-footer"><span><GraduationCap size={15} /> CRAVES ACADEMY</span><span>Internal learning · No live-system exercises · No customer payloads</span></footer>
  </div>;
}

function LessonRoom({ course, lesson, catalog, onProgress }: { course: Course; lesson: Lesson; catalog: Catalog; onProgress: () => Promise<void> }) {
  const [tab, setTab] = useState("lesson"), [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const online = useAcademyConnection();
  const [copied, setCopied] = useState(false);
  const [activityWarning, setActivityWarning] = useState(false);
  const [progressRefreshFailed, setProgressRefreshFailed] = useState(false);
  const [clipboardFailed, setClipboardFailed] = useState(false);
  const [retryIn, setRetryIn] = useState(0);
  useEffect(() => { if (retryIn <= 0) return; const timer = setTimeout(() => setRetryIn(v => Math.max(0, v - 1)), 1000); return () => clearTimeout(timer); }, [retryIn]);
  useEffect(() => { if (!copied) return; const timeout = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timeout); }, [copied]);
  const [source, setSource] = useState<{ code: string; path: string; revision: string; sha256: string } | null>(null), [sourceIndex, setSourceIndex] = useState(0), [sourceBusy, setSourceBusy] = useState(false);
  const requestId = useRef<string | null>(null), sourceSequence = useRef(0), lastInput = useRef(0);
  useEffect(() => {
    let alive = true; lastInput.current = Date.now();
    const record = (kind: string) => activity(course.id, lesson.id, kind).catch(() => { if (alive) setActivityWarning(true); });
    void record("LESSON_OPEN");
    const active = () => { lastInput.current = Date.now(); };
    window.addEventListener("pointerdown", active); window.addEventListener("keydown", active); window.addEventListener("scroll", active, { passive: true });
    const timer = setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastInput.current < 60000) void record("ACTIVE_HEARTBEAT"); }, 30000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("pointerdown", active); window.removeEventListener("keydown", active); window.removeEventListener("scroll", active); };
  }, [course.id, lesson.id]);
  async function loadSource(index: number) {
    const sequence = ++sourceSequence.current; setSourceBusy(true); setSource(null); setCopied(false); setError(null); setSourceIndex(index);
    try { const value = await api<{ code: string; path: string; revision: string; sha256: string }>(`sources/${course.id}/${index}`); if (sequence === sourceSequence.current) setSource(value); }
    catch (e) { if (sequence === sourceSequence.current) setError(e); }
    finally { if (sequence === sourceSequence.current) setSourceBusy(false); }
  }
  async function submit() {
    if (busy || !online || retryIn > 0 || lesson.questions.some(q => answers[q.id] === undefined)) return;
    setBusy(true); setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      const result = await api<QuizResult>("attempts", "POST", { requestId: requestId.current, courseId: course.id, lessonId: lesson.id, version: catalog.version, answers: lesson.questions.map(q => answers[q.id]) });
      setResult(result); try { await onProgress(); setProgressRefreshFailed(false); } catch { setProgressRefreshFailed(true); }
    } catch (e) { setError(e); if (e instanceof AcademyRequestError && e.status === 429) setRetryIn(e.retryAfter || 30); } finally { setBusy(false); }
  }
  return <section className="ca-lesson-main">{activityWarning && <AcademyNotice onDismiss={() => setActivityWarning(false)}>Optional activity logging is unavailable. You can keep reading; quiz saves are confirmed separately.</AcademyNotice>}{progressRefreshFailed && <AcademyNotice>Your quiz attempt is saved. The progress cards could not refresh. <button className="ca-secondary" onClick={async () => { try { await onProgress(); setProgressRefreshFailed(false); } catch { setProgressRefreshFailed(true); } }}>Refresh progress only</button></AcademyNotice>}{clipboardFailed && <AcademyNotice onDismiss={() => setClipboardFailed(false)}>Clipboard permission is unavailable. Select the read-only code and copy it with your keyboard.</AcademyNotice>}<div className="ca-lesson-head"><span className="ca-kicker">SECTION {course.lessons.indexOf(lesson) + 1} / {course.lessons.length}</span><h2>{lesson.title}</h2><div className="ca-tabs"><button aria-current={tab === "lesson" ? "page" : undefined} onClick={() => setTab("lesson")}><BookOpen size={15} /> Walkthrough</button><button aria-current={tab === "guided" ? "page" : undefined} onClick={() => setTab("guided")}><Play size={15} /> Guided lesson</button><button aria-current={tab === "source" ? "page" : undefined} onClick={() => { setTab("source"); if (!source && !sourceBusy) void loadSource(sourceIndex); }}><Code2 size={15} /> Source code</button><button aria-current={tab === "quiz" ? "page" : undefined} onClick={() => setTab("quiz")}><Target size={15} /> Section quiz</button></div></div>
    {Boolean(error) && <AcademyErrorState error={error} compact onRetry={() => { if (tab === "source") void loadSource(sourceIndex); else if (tab === "quiz") void submit(); else setError(null); }} busy={busy || sourceBusy} />}
    <div key={tab} className="ca-tab-content">
    {tab === "lesson" && <div className="ca-prose"><p className="ca-overview">{lesson.overview}</p><div className="ca-step-list">{lesson.steps.map((s, i) => <div key={s.label}><span>{String(i + 1).padStart(2, "0")}</span><div><h3>{s.label}</h3><p>{s.detail}</p></div></div>)}</div><div className="ca-example"><span className="ca-kicker">A CRAVES SCENARIO</span><p>{lesson.example}</p></div><div className="ca-lab"><span className="ca-kicker">SAFE PRACTICE ACTIVITY</span><p>{lesson.lab}</p><small>Read-only investigation, synthetic records, mocks or non-production tests only. This page never executes operational changes.</small></div><div className="ca-pitfall"><Lightbulb size={20} /><p>{lesson.pitfall}</p></div><button className="ca-primary" onClick={() => setTab("quiz")}>Check your understanding<ArrowRight size={17} /></button></div>}
    {tab === "guided" && <GuidedLesson lesson={lesson} onPlay={() => { void activity(course.id, lesson.id, "NARRATION_PLAY").catch(() => setActivityWarning(true)); }} />}
    {tab === "source" && <div className="ca-source"><label>Reviewed source file<select value={sourceIndex} onChange={e => void loadSource(Number(e.target.value))}>{course.sources.map((path, i) => <option key={path} value={i}>{path}</option>)}</select></label><p>Exact file content at the pinned revision. Read-only; no source is sent to an external AI provider.</p>{sourceBusy && <AcademySkeleton area="source" />}{source && <><div className="ca-source-header"><code>{source.path}</code><span>{source.revision.slice(0, 8)}</span><button className="ca-secondary" onClick={async () => { try { await navigator.clipboard.writeText(source.code); setCopied(true); setClipboardFailed(false); } catch { setClipboardFailed(true); } }}>{copied ? <Check size={14} /> : <Code2 size={14} />}{copied ? "Copied" : "Copy code"}</button></div><pre tabIndex={0} aria-label="Read-only source code"><code>{source.code}</code></pre><small>SHA-256: {source.sha256}</small></>}{!source && !sourceBusy && <button onClick={() => void loadSource(sourceIndex)}>Retry source load</button>}</div>}
    {tab === "quiz" && <div className="ca-quiz"><div className="ca-quiz-intro"><Target size={23} /><div><h3>Apply it to Craves</h3><p>Pass at 80% or higher. Each section has two questions, so both must be correct. A first pass earns 40 XP.</p></div></div>{lesson.questions.map((q, i) => <fieldset key={q.id} disabled={busy || Boolean(result)}><legend><span>{i + 1}.</span> {q.prompt}</legend>{q.options.map((option, index) => <label className={`ca-option ${answers[q.id] === index ? "selected" : ""}`} key={option}><input type="radio" name={q.id} value={index} checked={answers[q.id] === index} onChange={() => { setAnswers(old => ({ ...old, [q.id]: index })); setResult(null); requestId.current = null; }} /><span>{option}</span></label>)}{result && <div className={`ca-feedback ${result.feedback[i].correct ? "correct" : "incorrect"}`}><strong>{result.feedback[i].correct ? "Correct" : `Review: ${q.options[result.feedback[i].answer]}`}</strong><p>{result.feedback[i].explanation}</p></div>}</fieldset>)}<button className="ca-primary" disabled={busy || !online || retryIn > 0 || Boolean(result) || lesson.questions.some(q => answers[q.id] === undefined)} onClick={() => void submit()}>{busy ? <><RefreshCw size={16} className="ca-spin" />Saving your attempt…</> : !online ? "Reconnect to submit" : retryIn > 0 ? `Try again in ${retryIn}s` : "Submit section quiz"}<ArrowRight size={16} /></button>{result && <div className="ca-result" role="status"><Trophy size={28} /><div><h3>{result.passed ? "Section passed" : "A good moment to review"} · {result.score}%</h3><p>{result.earnedXp > 0 ? `+${result.earnedXp} XP saved, including any first-time course-completion reward.` : result.passed ? "Your progress is saved. Previously earned rewards are not duplicated." : "Read the explanation and revisit the walkthrough before trying again."}</p>{result.mastery !== null && <small>Bayesian practice signal: {Math.round(result.mastery * 100)}%. Uncalibrated learning support, not a competence rating.</small>}<button className="ca-secondary" onClick={() => { setResult(null); requestId.current = null; setError(null); }}>{result.passed ? "Practise again" : "Review and try again"}</button></div></div>}</div>}
    </div>
  </section>;
}

function GuidedLesson({ lesson, onPlay }: { lesson: Lesson; onPlay: () => void }) {
  const scenes = useMemo(() => [{ label: lesson.title, detail: lesson.overview }, ...lesson.steps, { label: "A Craves scenario", detail: lesson.example }], [lesson]);
  const [scene, setScene] = useState(0), [playing, setPlaying] = useState(false), [voiceOn, setVoiceOn] = useState(false), [voiceAvailable, setVoiceAvailable] = useState(false);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const check = () => setVoiceAvailable(window.speechSynthesis.getVoices().some(v => v.localService && v.lang.startsWith("en")));
    check(); window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", check); window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => { if (document.visibilityState !== "visible") { setPlaying(false); return; } if (scene < scenes.length - 1) setScene(scene + 1); else setPlaying(false); }, Math.max(12000, scenes[scene].detail.split(/\s+/).length * 430));
    return () => clearTimeout(timer);
  }, [playing, scene, scenes]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (!playing || !voiceOn) return;
    const voice = window.speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith("en"));
    if (!voice) return;
    const speech = new SpeechSynthesisUtterance(`${scenes[scene].label}. ${scenes[scene].detail}`); speech.voice = voice; speech.rate = 0.94; window.speechSynthesis.speak(speech);
    return () => window.speechSynthesis.cancel();
  }, [playing, voiceOn, scene, scenes]);
  return <div className="ca-guided"><div className="ca-video-stage"><span className="ca-eyebrow">CRAVES EXPLAINED · CHAPTER {scene + 1}</span><div className="ca-video-symbol"><Layers3 size={38} /></div><h3>{scenes[scene].label}</h3><p>{scenes[scene].detail}</p><div className="ca-scene-dots">{scenes.map((s, i) => <button key={`${s.label}-${i}`} aria-label={`Go to chapter ${i + 1}`} aria-current={i === scene ? "step" : undefined} onClick={() => setScene(i)} />)}</div></div><div className="ca-player-controls"><button onClick={() => setScene(Math.max(0, scene - 1))} disabled={scene === 0} aria-label="Previous chapter"><ChevronLeft size={20} /></button><button className="ca-primary" onClick={() => { if (!playing) onPlay(); setPlaying(!playing); }}>{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? "Pause" : "Play guided lesson"}</button><button onClick={() => setScene(Math.min(scenes.length - 1, scene + 1))} disabled={scene === scenes.length - 1} aria-label="Next chapter"><ChevronRight size={20} /></button><label><input type="checkbox" disabled={!voiceAvailable} checked={voiceOn} onChange={e => setVoiceOn(e.target.checked)} /><Volume2 size={15} /> Device narration</label></div><p className="ca-media-note">AI-authored teaching storyboard with animated chapters and optional on-device narration. This is not a rendered AI-avatar video or an MP4. {voiceAvailable ? "Only a locally available English voice is used." : "A local English voice is not available in this browser; the full text remains accessible."}</p><details><summary>Read the full transcript</summary>{scenes.map((s, i) => <div key={i}><h4>{s.label}</h4><p>{s.detail}</p></div>)}</details></div>;
}

function Roadmap({ catalog, canManage }: { catalog: Catalog; canManage: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]), [error, setError] = useState<unknown>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null), [deleteBusy, setDeleteBusy] = useState(false), [deleteError, setDeleteError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const online = useAcademyConnection();
  const [edit, setEdit] = useState<Plan | null>(null), [status, setStatus] = useState("all");
  const [title, setTitle] = useState(""), [service, setService] = useState("platform"), [details, setDetails] = useState(""), [stage, setStage] = useState("PROPOSED");
  const reload = useCallback(async () => { setLoading(true); try { setPlans(await api<Plan[]>("plans")); setError(null); } catch (e) { setError(e); } finally { setLoading(false); } }, []);
  useEffect(() => { void reload(); }, [reload]);
  function choose(plan: Plan) { setEdit(plan); setTitle(plan.title); setService(plan.service); setDetails(plan.details); setStage(plan.status); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try { await api("plans", "PUT", { id: edit?.id || crypto.randomUUID(), title, service, details, status: stage, expectedRevision: edit?.revision || 0 }); setEdit(null); setTitle(""); setDetails(""); setStage("PROPOSED"); setSaved(true); await reload(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <section className="ca-roadmap"><div className="ca-section-title"><div><span className="ca-kicker">KEEP IDEAS DISTINCT FROM FACTS</span><h2>Future plans, with context.</h2><p>Private runtime records. No unpublished business plans are seeded into the public repository.</p></div><select value={status} aria-label="Filter plans by status" onChange={e => setStatus(e.target.value)}><option value="all">All stages</option>{["PROPOSED", "APPROVED", "IN_PROGRESS", "SHIPPED"].map(s => <option key={s}>{s}</option>)}</select></div>{Boolean(error) && <AcademyErrorState error={error} compact onRetry={() => void reload()} />}{saved && <AcademyNotice success onDismiss={() => setSaved(false)}>Your private plan is saved.</AcademyNotice>}{loading ? <AcademySkeleton area="plans" /> : <div className="ca-plan-grid">{plans.filter(p => status === "all" || p.status === status).map(p => <article className="ca-panel" key={p.id}><span className="ca-pill">{p.status.replaceAll("_", " ")}</span><h3>{p.title}</h3><small>{p.service} · revision {p.revision}</small><p className="ca-plan-detail">{p.details}</p>{canManage && <div className="ca-row"><button onClick={() => choose(p)}>Edit plan</button><button className="ca-danger" onClick={() => { setDeleting(p); setDeleteError(null); }}>Delete</button></div>}</article>)}</div>}{!loading && !error && plans.length > 0 && !plans.some(p => status === "all" || p.status === status) && <div className="ca-empty"><Search size={28} /><h3>No plans at this stage</h3><p>Your other internal plans are still available.</p><button className="ca-secondary" onClick={() => setStatus("all")}>Show all stages</button></div>}{!loading && !error && !plans.length && <div className="ca-empty"><Lightbulb size={34} /><h3>No future plans published yet</h3><p>A platform administrator can add approved internal context below. Proposed work is never presented as implemented behavior.</p></div>}{canManage && <form className="ca-panel ca-plan-form" onSubmit={save} aria-busy={busy}><fieldset disabled={busy}><h3>{edit ? "Edit private plan" : "Publish an internal plan"}</h3><label>Plan title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><div className="ca-form-grid"><label>Service area<select value={service} onChange={e => setService(e.target.value)}><option value="platform">Platform</option>{catalog.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>Evidence stage<select value={stage} onChange={e => setStage(e.target.value)}>{["PROPOSED", "APPROVED", "IN_PROGRESS", "SHIPPED"].map(s => <option key={s}>{s}</option>)}</select></label></div><label>Context, rationale and evidence<textarea required maxLength={8000} rows={6} value={details} onChange={e => setDetails(e.target.value)} placeholder="Explain the change, owner, dependencies and approval or deployment evidence. Do not enter credentials or customer data." /></label><div className="ca-row"><button className="ca-primary" disabled={busy || !online}>{busy ? <><RefreshCw className="ca-spin" size={16} />Saving…</> : !online ? "Reconnect to save" : "Save private plan"}</button>{edit && <button type="button" onClick={() => { setEdit(null); setTitle(""); setDetails(""); }}>Cancel editing</button>}</div></fieldset></form>}{deleting && <AcademyDeleteDialog title={deleting.title} busy={deleteBusy} error={deleteError} onCancel={() => setDeleting(null)} onConfirm={async () => {
    setDeleteBusy(true); setDeleteError(null);
    try { await api(`plans/${deleting.id}?revision=${deleting.revision}`, "DELETE"); setDeleting(null); await reload(); }
    catch (e) { setDeleteError(e); } finally { setDeleteBusy(false); }
  }} />}</section>;
}

function Insights() {
  const [report, setReport] = useState<Report | null>(null), [page, setPage] = useState(0), [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setReport(null); api<Report>(`analytics?page=${page}`).then(r => { if (active) { setReport(r); setError(""); } }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, [page, retry]);
  if (error) return <AcademyErrorState error={error} onRetry={() => { setError(null); setRetry(v => v + 1); }} />;
  if (!report) return <AcademySkeleton area="report" />;
  const max = Math.max(1, ...report.daily.map(d => d.events));
  return <section><div className="ca-section-title"><div><span className="ca-kicker">LEARNING SUPPORT, NOT STAFF SCORING</span><h2>See where learning is happening.</h2><p>{report.notice}</p></div></div><div className="ca-insight-stats"><div className="ca-panel"><strong>{report.totalLearners}</strong><span>Registered learners</span></div><div className="ca-panel"><strong>{report.completedSections}</strong><span>Current-version section passes</span></div><div className="ca-panel"><strong>{report.totalXp}</strong><span>Earned XP across the academy</span></div></div><div className="ca-panel ca-chart"><h3>Learning activity · last 30 days</h3><p>Server-recorded events, grouped by day in Asia/Kolkata.</p><svg viewBox="0 0 650 190" role="img" aria-label="Thirty-day learning activity chart"><line x1="30" y1="155" x2="640" y2="155" className="ca-chart-axis" />{report.daily.map((d, i) => <g key={d.day}><rect x={35 + i * 20} y={155 - 130 * d.events / max} width="12" height={130 * d.events / max} rx="4"><title>{d.day}: {d.events} recorded events</title></rect>{i % 7 === 0 && <text x={35 + i * 20} y="178" textAnchor="middle">{d.day.slice(5)}</text>}</g>)}</svg>{report.daily.every(d => d.events === 0) && <p>No recorded activity in this period. The chart is not filled with sample data.</p>}</div><div className="ca-panel ca-table-wrap"><h3>Learner progress</h3><p>Pseudonymous labels, ordered by registration—not a performance leaderboard.</p><table><thead><tr><th scope="col">Learner</th><th scope="col">XP</th><th scope="col">Sections passed</th><th scope="col">Last quiz practice</th></tr></thead><tbody>{report.learners.map(l => <tr key={l.learner}><td>{l.learner}</td><td>{l.xp}</td><td>{l.completed}</td><td>{l.lastPractice ? new Date(l.lastPractice).toLocaleDateString("en-IN") : "Not yet"}</td></tr>)}</tbody></table><div className="ca-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={(page + 1) * report.pageSize >= report.totalLearners} onClick={() => setPage(p => p + 1)}>Next</button></div></div></section>;
}
