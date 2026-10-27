package com.cravesapp

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import android.util.Log
import com.cravesapp.RiderOutboxCore.Answer
import com.cravesapp.RiderOutboxCore.Entry
import com.cravesapp.RiderOutboxCore.Kind
import com.cravesapp.RiderOutboxCore.Pass
import com.cravesapp.RiderOutboxCore.Refusal
import com.cravesapp.RiderOutboxCore.State
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.security.KeyStore
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * The phone's outbox of trip steps (P2-02, blueprint C2), used once the server sets features.nativeTripOutbox: a step
 * survives the app being swiped away, killed or the phone restarting. JS hands each step over (RiderOnlineModule) and
 * sends with its token while it runs; without JS, the online service (after each upload, on a new network) and a
 * persisted job (RiderOutboxJob, also after a reboot) send with the shift credential. Kept in filesDir/rider/outbox.json
 * through AtomicFile; the customer's OTP sealed with a Keystore key; the delivery photo left in filesDir/rider-photos
 * until the server answers. The rules are RiderOutboxCore's.
 */
object RiderOutbox {
  private const val TAG = "CravesRiderOutbox"
  private const val KEY_ALIAS = "craves_rider_outbox"
  /** One job id ("RDOB"), far from WorkManager's ids, which count up from 0. */
  private const val JOB_ID = 0x52444f42
  private const val CREDENTIAL_HEADER = "X-Craves-Shift-Credential"
  // shortcut: English, as the same refusal in riderApi.live.ts; translate both with P2-08.
  private const val PHOTO_MISSING = "The delivery photo is gone from this phone. Take the photo again."
  private val JSON = "application/json; charset=utf-8".toMediaType()
  private val JPEG = "image/jpeg".toMediaType()
  private val ISO_PATTERNS = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX")

  /** Sends and the changes they make run here, one at a time; reading the queue and dismissing a notice don't wait. */
  private val executor = Executors.newSingleThreadExecutor()
  private val lock = Any()
  /** The queue as stored, read once per process; guarded by lock. */
  private var state: State? = null
  /** Codes the Keystore couldn't seal wait in memory only, as in the JS queue without a secret store. */
  private val unsealed = ConcurrentHashMap<String, String>()

  private val http =
    OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .writeTimeout(10, TimeUnit.SECONDS)
      .readTimeout(10, TimeUnit.SECONDS)
      .callTimeout(15, TimeUnit.SECONDS)
      .build()
  // A photo on 2G/3G needs longer, as in the app (riderApi.live.ts, 90 s).
  private val photoHttp =
    http.newBuilder()
      .writeTimeout(60, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .callTimeout(90, TimeUnit.SECONDS)
      .build()

  /** Who sends: the app's token while JS runs, else the shift credential. apiBaseUrl has no trailing slash. */
  private class Auth(val token: String?, val credential: String?, val apiBaseUrl: String)

  /**
   * Saves a step from JS ({riderId, tripId, action, key, body, occurredAt, fix}; a key already queued is that step), then
   * runs a pass as flush does (options), in one go so no other pass sends the step in between. The rider just tapped, so
   * this trip's steps don't wait out a backoff. Resolves {entryId, results, needsAuth} as JSON.
   */
  fun enqueue(context: Context, json: String, options: String, promise: Promise) {
    val app = context.applicationContext
    submit(promise) {
      val input = JSONObject(json)
      val queued = current(app).entries.firstOrNull { it.key == input.getString("key") }
      val id = queued?.id ?: newEntry(app, input, moved = false).also { entry -> mutate(app) { it.copy(entries = it.entries + entry) } }.id
      // On disk now: should the app die during the send, the job still sends it.
      syncJob(app)
      passFor(app, JSONObject(options).put("tripId", input.getString("tripId"))).put("entryId", id).toString()
    }
  }

  /** The JS queue moved in ({entries, refusals}, P2-02b): steps keep their ids and keys, and count as deferred. */
  fun import(context: Context, json: String, promise: Promise) {
    val app = context.applicationContext
    submit(promise) {
      val input = JSONObject(json)
      val keys = current(app).entries.mapTo(HashSet()) { it.key }
      val entries = objects(input.optJSONArray("entries")).filter { keys.add(it.getString("key")) }.map { newEntry(app, it, moved = true) }
      val refusals =
        objects(input.optJSONArray("refusals")).map {
          Refusal(it.getString("riderId"), it.getString("tripId"), it.getString("action"), 0, it.str("code").orEmpty(),
            it.str("message").orEmpty(), it.int("attemptsLeft"), it.optLong("at"))
        }
      mutate(app) { state ->
        State(
          state.entries + entries,
          (state.refusals + refusals).sortedByDescending { it.at }.distinctBy { it.tripId }.take(RiderOutboxCore.MAX_REFUSALS),
        )
      }
      syncJob(app)
      null
    }
  }

  /** A pass JS asked for (options as passFor); resolves {results, needsAuth} as JSON. */
  fun flush(context: Context, options: String, promise: Promise) {
    val app = context.applicationContext
    submit(promise) { passFor(app, JSONObject(options)).toString() }
  }

  /** A step still waiting once the rider's tap is over: they were told it will sync, so an OTP goes with capturedOffline. */
  fun defer(context: Context, id: String) {
    val app = context.applicationContext
    if (current(app).entries.none { it.id == id && !it.deferred }) return
    mutate(app) { state -> state.copy(entries = state.entries.map { if (it.id == id) it.copy(deferred = true) else it }) }
  }

  /**
   * A pass with the shift credential when JS may not be running: after an upload reached the server, on a new network,
   * and from the job. Tells JS what changed (riderOutboxChanged). done(retry): a step failed and is worth another try.
   */
  fun flushInBackground(context: Context, done: ((Boolean) -> Unit)? = null) {
    val app = context.applicationContext
    executor.execute {
      var retry = false
      try {
        val auth = if (current(app).entries.isEmpty()) null else credentialAuth(app)
        if (auth != null) {
          // The phone just reached the network or the server, so no step waits out a backoff (as JS on a signal).
          val pass = pass(app, auth, null, skipBackoff = true, skipTrip = null)
          retry = pass.retrying
          if (pass.results.isNotEmpty()) {
            val answer = passJson(pass).toString()
            RiderEvents.emit("riderOutboxChanged") { Arguments.createMap().apply { putString("answer", answer) } }
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "background pass failed", error)
        retry = true
      } finally {
        done?.invoke(retry)
      }
    }
  }

  /** What JS lists ({entries, refusals}), from memory: never the sealed code, never waiting for a send. */
  fun state(context: Context): String {
    val state = current(context.applicationContext)
    return JSONObject()
      .put("entries", JSONArray(state.entries.map { entryJson(it, stored = false) }))
      .put("refusals", JSONArray(state.refusals.map { refusalJson(it) }))
      .toString()
  }

  /** The rider dismissed a trip's refusal notice; not queued behind a send. */
  fun dismissRefusal(context: Context, tripId: String) {
    mutate(context.applicationContext) { state -> state.copy(refusals = state.refusals.filter { it.tripId != tripId }) }
  }

  /** Steps waiting and the oldest one's createdAt (0 when none), for the phone's health report. */
  fun stats(context: Context): Pair<Int, Long> {
    val entries = current(context.applicationContext).entries
    return entries.size to (entries.minOfOrNull { it.createdAt } ?: 0L)
  }

  /**
   * A pass for JS ({riderId, accessToken, apiBaseUrl, now, tripId}): with the token, that rider's steps; without one, every
   * step with the shift credential when a shift is saved. now: no step waits out a backoff; tripId: that trip's don't.
   */
  private fun passFor(context: Context, options: JSONObject): JSONObject {
    val token = options.str("accessToken")
    val auth = if (token != null) Auth(token, null, options.getString("apiBaseUrl").trimEnd('/')) else credentialAuth(context)
    val riderId = if (token != null) options.getString("riderId") else null
    return passJson(pass(context, auth, riderId, options.optBoolean("now"), options.str("tripId")))
  }

  private fun credentialAuth(context: Context): Auth? =
    RiderOnlineService.loadShift(context)?.let { Auth(null, it.credential, it.apiBaseUrl) }

  private fun pass(context: Context, auth: Auth?, riderId: String?, skipBackoff: Boolean, skipTrip: String?): Pass {
    val pass =
      if (auth == null) {
        // Neither a token nor a shift: nothing can go; JS renews its token if it has steps waiting.
        Pass(emptyList(), needsAuth = current(context).entries.any { riderId == null || it.riderId == riderId }, retrying = false)
      } else {
        RiderOutboxCore.pass(store(context), riderId, auth.token == null, skipBackoff, skipTrip, System::currentTimeMillis) {
          send(context, it, auth)
        }
      }
    pass.results.filter { it.kind != Kind.QUEUED }.forEach { release(context, it.entry) }
    syncJob(context)
    return pass
  }

  /** One step exactly as liveRiderApi.tripAction sends it, so the server can't tell the two apart. */
  private fun send(context: Context, entry: Entry, auth: Auth): Answer {
    try {
      val since = RiderOutboxCore.sinceTapMs(entry, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootCount(context))
      val body = entry.body?.let { JSONObject(it) } ?: JSONObject()
      val fix = since?.let { agedFix(entry, it) }
      val request =
        Request.Builder()
          .url("${auth.apiBaseUrl}/api/v1/rider/trips/${Uri.encode(entry.tripId)}/${Uri.encode(entry.action)}")
          .header("Idempotency-Key", entry.key)
      if (auth.token != null) request.header("Authorization", "Bearer ${auth.token}") else request.header(CREDENTIAL_HEADER, auth.credential.orEmpty())
      if (entry.action == "delivered" && body.optString("method") == "PHOTO") {
        // Never a delivery without its photo: the refusal asks the rider for another (P1-07).
        val photo = photo(context, body.optString("photoUri")) ?: return Answer(422, "PHOTO_MISSING", PHOTO_MISSING)
        val form = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("photo", "delivery.jpg", photo).addFormDataPart("method", "PHOTO")
        if (!body.isNull("callsMade")) form.addFormDataPart("callsMade", body.get("callsMade").toString())
        (fix ?: body.optJSONObject("fix"))?.let { form.addFormDataPart("fix", it.toString()) }
        since?.let { form.addFormDataPart("ageMs", it.toString()) }
        return photoHttp.newCall(request.post(form.build()).build()).execute().use { answer(it) }
      }
      if (body.optString("method") == "OTP") {
        // The code back from its seal, and capturedOffline once the step outlived its tap.
        (entry.otpSealed?.let { unseal(it) } ?: unsealed[entry.id])?.let { body.put("otp", it) }
        if (entry.deferred) body.put("capturedOffline", true)
      }
      if (since != null) {
        body.put("ageMs", since)
        fix?.let { body.put("fix", it) }
      }
      val text = if (entry.body == null && since == null) "" else body.toString()
      return http.newCall(request.post(text.toRequestBody(if (text.isEmpty()) null else JSON)).build()).execute().use { answer(it) }
    } catch (error: IOException) {
      return Answer(null)
    } catch (error: Exception) {
      // Never drop a step for a fault here: it waits, and the phone's health report shows it waiting.
      Log.w(TAG, "step not sent", error)
      return Answer(null)
    }
  }

  private fun answer(response: Response): Answer {
    val json =
      try {
        JSONObject(response.body?.string().orEmpty())
      } catch (error: JSONException) {
        null
      }
    if (response.isSuccessful) return Answer(response.code, trip = json?.toString())
    return Answer(response.code, json?.str("code").orEmpty(), json?.str("message").orEmpty(), json?.int("attemptsLeft"))
  }

  /** The tap's fix aged to now (stepTap): its age at the tap, or from its own stamp, plus the time since the tap. */
  private fun agedFix(entry: Entry, since: Long): JSONObject? {
    val fix = entry.fix?.let { JSONObject(it) } ?: return null
    val occurredAt = entry.occurredAt ?: return null
    val atTap = if (!fix.isNull("ageMs")) fix.optDouble("ageMs") else isoMs(fix.optString("at"))?.let { (occurredAt - it).toDouble() }
    return RiderOutboxCore.fixAgeMs(atTap, since)?.let { fix.put("ageMs", it) }
  }

  private fun isoMs(text: String): Long? =
    ISO_PATTERNS.firstNotNullOfOrNull { pattern ->
      try {
        SimpleDateFormat(pattern, Locale.US).parse(text)?.time
      } catch (error: ParseException) {
        null
      }
    }

  /** The kept photo (a file in rider-photos), or the camera's own when keeping it failed; null once it is gone. */
  private fun photo(context: Context, uri: String): RequestBody? {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == "file") return parsed.path?.let { File(it) }?.takeIf { it.isFile }?.asRequestBody(JPEG)
    return try {
      context.contentResolver.openInputStream(parsed)?.use { it.readBytes() }?.toRequestBody(JPEG)
    } catch (error: Exception) {
      null
    }
  }

  /** Once the server answered for a step (sent or refused), its code and its kept photo go. */
  private fun release(context: Context, entry: Entry) {
    unsealed.remove(entry.id)
    val body = entry.body?.let { JSONObject(it) } ?: return
    if (body.optString("method") == "PHOTO") RiderDeviceModule.deleteKeptPhoto(context, body.optString("photoUri"))
  }

  /** A step from JS: the customer's code leaves the body for its seal; the tap's clocks are read now (moved: unknown). */
  private fun newEntry(context: Context, input: JSONObject, moved: Boolean): Entry {
    val now = System.currentTimeMillis()
    val id = if (moved) input.getString("id") else UUID.randomUUID().toString()
    val body = input.optJSONObject("body")
    val otp = body?.str("otp")
    body?.remove("otp")
    body?.remove("otpRef")
    var sealed: String? = null
    if (otp != null) {
      sealed = seal(otp)
      if (sealed == null) unsealed[id] = otp
    }
    val occurredAt = input.long("occurredAt")
    return Entry(
      id = id,
      riderId = input.getString("riderId"),
      tripId = input.getString("tripId"),
      action = input.getString("action"),
      key = input.getString("key"),
      body = body?.toString(),
      otpSealed = sealed,
      occurredAt = occurredAt,
      elapsedMs = if (moved || occurredAt == null) -1 else SystemClock.elapsedRealtime() - (now - occurredAt).coerceAtLeast(0),
      boot = if (moved) -1 else bootCount(context),
      fix = input.optJSONObject("fix")?.toString(),
      createdAt = if (moved) input.optLong("createdAt", now) else now,
      deferred = moved,
    )
  }

  /** Base64 of the 12-byte IV and the AES-GCM ciphertext; null when the Keystore can't seal. */
  private fun seal(plain: String): String? =
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
      Base64.encodeToString(cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    } catch (error: Exception) {
      Log.w(TAG, "can't seal the code; it waits in memory", error)
      null
    }

  private fun unseal(sealed: String): String? =
    try {
      val bytes = Base64.decode(sealed, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12)) }
      String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
    } catch (error: Exception) {
      // The step then goes without the code, and the server's refusal shows (as in the JS queue).
      Log.w(TAG, "can't open the sealed code", error)
      null
    }

  /** The outbox's AES key, made once in the Android Keystore; only the outbox thread seals and opens. */
  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun bootCount(context: Context): Int =
    try {
      Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
    } catch (error: Exception) {
      -1
    }

  /** A persisted job that waits for a network, while steps wait: it sends after a kill or a reboot (P2-02c). */
  private fun syncJob(context: Context) {
    if (current(context).entries.isEmpty()) return
    try {
      val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
      if (scheduler.getPendingJob(JOB_ID) != null) return
      scheduler.schedule(
        JobInfo.Builder(JOB_ID, ComponentName(context, RiderOutboxJob::class.java))
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .setPersisted(true)
          .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
          .build(),
      )
    } catch (error: Exception) {
      // The steps still go with the next upload or when the app opens.
      Log.w(TAG, "outbox job not scheduled", error)
    }
  }

  private fun submit(promise: Promise, task: () -> String?) {
    executor.execute {
      try {
        promise.resolve(task())
      } catch (error: Exception) {
        Log.w(TAG, "outbox call failed", error)
        promise.reject("RIDER_OUTBOX", error)
      }
    }
  }

  private fun store(context: Context) =
    object : RiderOutboxCore.Store {
      override fun state(): State = current(context)

      override fun update(change: (State) -> State) = mutate(context, change)
    }

  private fun current(context: Context): State = synchronized(lock) { state ?: read(context).also { state = it } }

  /** Applies a change and saves it before returning; memory takes it first, as in the JS queue, if the write fails. */
  private fun mutate(context: Context, change: (State) -> State) {
    synchronized(lock) {
      val next = change(current(context))
      state = next
      write(context, next)
    }
  }

  private fun file(context: Context) = AtomicFile(File(File(context.filesDir, "rider").apply { mkdirs() }, "outbox.json"))

  private fun read(context: Context): State {
    val file = file(context)
    return try {
      val json = JSONObject(String(file.readFully(), Charsets.UTF_8))
      val state =
        State(
          objects(json.optJSONArray("entries")).map { entry(it) },
          objects(json.optJSONArray("refusals")).map { refusal(it) },
        )
      RiderOutboxCore.loaded(state, System.currentTimeMillis())
    } catch (error: FileNotFoundException) {
      State()
    } catch (error: Exception) {
      // Never written over: kept aside for support, and the outbox starts empty.
      Log.e(TAG, "outbox unreadable, kept aside", error)
      file.baseFile.renameTo(File(file.baseFile.path + ".unreadable-" + System.currentTimeMillis()))
      State()
    }
  }

  private fun write(context: Context, state: State) {
    val file = file(context)
    val out = file.startWrite()
    try {
      val json =
        JSONObject()
          .put("v", 2)
          .put("entries", JSONArray(state.entries.map { entryJson(it, stored = true) }))
          .put("refusals", JSONArray(state.refusals.map { refusalJson(it) }))
      out.write(json.toString().toByteArray(Charsets.UTF_8))
      file.finishWrite(out)
    } catch (error: IOException) {
      file.failWrite(out)
      throw error
    }
  }

  /** A step as JS lists it (QueueEntry); stored, the file also keeps the sealed code and the tap's clocks. */
  private fun entryJson(entry: Entry, stored: Boolean): JSONObject =
    JSONObject()
      .put("id", entry.id)
      .put("riderId", entry.riderId)
      .put("tripId", entry.tripId)
      .put("action", entry.action)
      .put("key", entry.key)
      .put("createdAt", entry.createdAt)
      .put("attempts", entry.attempts)
      .put("nextAttemptAt", entry.nextAttemptAt)
      .put("deferred", entry.deferred)
      .apply {
        entry.body?.let { put("body", JSONObject(it)) }
        entry.occurredAt?.let { put("occurredAt", it) }
        entry.fix?.let { put("fix", JSONObject(it)) }
        if (stored) {
          put("elapsedMs", entry.elapsedMs)
          put("boot", entry.boot)
          entry.otpSealed?.let { put("otpSealed", it) }
        }
      }

  private fun entry(json: JSONObject) =
    Entry(
      id = json.getString("id"),
      riderId = json.getString("riderId"),
      tripId = json.getString("tripId"),
      action = json.getString("action"),
      key = json.getString("key"),
      body = json.optJSONObject("body")?.toString(),
      otpSealed = json.str("otpSealed"),
      occurredAt = json.long("occurredAt"),
      elapsedMs = json.optLong("elapsedMs", -1),
      boot = json.optInt("boot", -1),
      fix = json.optJSONObject("fix")?.toString(),
      createdAt = json.getLong("createdAt"),
      attempts = json.optInt("attempts"),
      nextAttemptAt = json.optLong("nextAttemptAt"),
      deferred = json.optBoolean("deferred"),
    )

  private fun refusalJson(refusal: Refusal): JSONObject =
    JSONObject()
      .put("riderId", refusal.riderId)
      .put("tripId", refusal.tripId)
      .put("action", refusal.action)
      .put("status", refusal.status)
      .put("code", refusal.code)
      .put("message", refusal.message)
      .put("at", refusal.at)
      .apply { refusal.attemptsLeft?.let { put("attemptsLeft", it) } }

  private fun refusal(json: JSONObject) =
    Refusal(
      json.getString("riderId"),
      json.getString("tripId"),
      json.getString("action"),
      json.optInt("status"),
      json.str("code").orEmpty(),
      json.str("message").orEmpty(),
      json.int("attemptsLeft"),
      json.optLong("at"),
    )

  /** A pass for JS: each step's result (sent, queued or rejected), the trip a sent step returned, a refusal's answer. */
  private fun passJson(pass: Pass): JSONObject =
    JSONObject()
      .put("needsAuth", pass.needsAuth)
      .put(
        "results",
        JSONArray(
          pass.results.map { result ->
            JSONObject().put("entry", entryJson(result.entry, stored = false)).put("kind", result.kind.name.lowercase(Locale.ROOT)).apply {
              val answer = result.answer
              if (result.kind == Kind.SENT) answer?.trip?.let { put("trip", JSONObject(it)) }
              if (result.kind == Kind.REJECTED && answer != null) {
                put("status", answer.status ?: 0)
                put("code", answer.code)
                put("message", answer.message)
                put("answered", result.answered)
                answer.attemptsLeft?.let { put("attemptsLeft", it) }
              }
            }
          },
        ),
      )

  private fun objects(array: JSONArray?): List<JSONObject> =
    if (array == null) emptyList() else (0 until array.length()).map { array.getJSONObject(it) }

  // org.json's optString turns null into "null": read absent and null alike as Kotlin null.
  private fun JSONObject.str(name: String): String? = if (isNull(name)) null else optString(name)

  private fun JSONObject.long(name: String): Long? = if (isNull(name)) null else optLong(name)

  private fun JSONObject.int(name: String): Int? = if (isNull(name)) null else optInt(name)
}
