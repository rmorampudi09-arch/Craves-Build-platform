package com.cravesapp

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject

/**
 * The rider's online foreground service (type location), started from the Go Online tap so it needs no
 * background-location permission. Uploads batches of fixes with the shift credential, rings offers from
 * the response, and stops on a stop code, a dead credential or stop().
 */
class RiderOnlineService : Service() {

  /** JS only hands the shift credential over from /shift/start; it is kept only in this app's private preferences. */
  class Shift(val credential: String, val expiresAtMs: Long, val apiBaseUrl: String)

  /** elapsedMs is the fix's SystemClock.elapsedRealtime time: the server times the fix from its age, not from atMs. */
  class Fix(val lat: Double, val lng: Double, val accuracyM: Float, val atMs: Long, val mock: Boolean, val elapsedMs: Long) {
    /** ageMs is worked out when the call is built, by the monotonic clock, so a wrong phone clock doesn't matter (blueprint A6). */
    fun toJson(): JSONObject =
      JSONObject()
        .put("lat", lat)
        .put("lng", lng)
        .put("accuracyM", accuracyM.toDouble())
        .put("at", iso(atMs))
        .put("mock", mock)
        .put("ageMs", (SystemClock.elapsedRealtime() - elapsedMs).coerceAtLeast(0L))

    /** ageMs is the fix's age now; JS adds the time since, so a trip step can say how old its fix was (blueprint A4). */
    fun toMap(): WritableMap =
      Arguments.createMap().apply {
        putDouble("lat", lat)
        putDouble("lng", lng)
        putDouble("accuracyM", accuracyM.toDouble())
        putString("at", iso(atMs))
        putBoolean("mock", mock)
        putDouble("ageMs", (SystemClock.elapsedRealtime() - elapsedMs).coerceAtLeast(0L).toDouble())
      }
  }

  private lateinit var executor: ScheduledExecutorService
  private lateinit var fused: FusedLocationProviderClient
  private var wakeLock: PowerManager.WakeLock? = null
  @Volatile private var shift: Shift? = null
  @Volatile private var stopMessage: String? = null
  /** Set under the callback's lock in onDestroy, so the executor can't re-register location updates or report after it. */
  @Volatile private var destroyed = false
  // Touched only on the executor thread, which also receives the location callbacks.
  private val fixes = ArrayDeque<Fix>()
  private var onTrip = false
  private var tripSignature = ""
  // Phone health (blueprint A5), also only on the executor thread. shortcut: drain and unplugged time restart with the
  // service, not the shift; keep them in the shift's preferences if a restart mid-shift turns out to matter.
  private var healthSentAtMs = 0L
  private var exitReason: String? = null
  private var sampledAtMs = 0L
  private var sampledPct = -1
  private var sampledCharging = true
  private var drainPct = 0.0
  private var unpluggedMs = 0L

  private val callback =
    object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.locations.forEach { add(it) }
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    executor = Executors.newSingleThreadScheduledExecutor()
    fused = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground first: Android kills a service started with startForegroundService that doesn't call it in time.
    try {
      RiderOffers.createChannels(this)
      ServiceCompat.startForeground(this, NOTIFICATION_ID, ongoing(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } catch (error: Exception) {
      // A sticky restart from the background can't start a location service on Android 12+; the shift stays saved for the next app open.
      Log.w(TAG, "can't start in the foreground", error)
      end(RESTART_MESSAGE, clearShift = false)
      return START_NOT_STICKY
    }
    val saved = loadShift(this)
    if (saved == null) {
      end(ENDED_MESSAGE)
      return START_NOT_STICKY
    }
    val firstStart = shift == null
    shift = saved
    if (firstStart) {
      running = true
      holdWakeLock(saved)
      executor.execute {
        exitReason = lastExitReason()
        requestLocations()
        tick()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    synchronized(callback) {
      destroyed = true
      fused.removeLocationUpdates(callback)
    }
    executor.shutdownNow()
    wakeLock?.takeIf { it.isHeld }?.release()
    val message = stopMessage
    RiderEvents.emit("riderStatus") {
      Arguments.createMap().apply {
        putString("state", "OFFLINE")
        lastFix?.let { putMap("lastFix", it.toMap()) }
        message?.let { putString("message", it) }
      }
    }
    super.onDestroy()
  }

  private fun add(location: Location) {
    val mock = if (Build.VERSION.SDK_INT >= 31) location.isMock else @Suppress("DEPRECATION") location.isFromMockProvider
    val fix = Fix(location.latitude, location.longitude, location.accuracy, location.time, mock, location.elapsedRealtimeNanos / 1_000_000)
    fixes.addLast(fix)
    while (fixes.size > MAX_FIXES) fixes.removeFirst()
    lastFix = fix
  }

  /** Balanced power while waiting for offers; high accuracy on a trip, for the customer map and distance evidence. */
  private fun requestLocations() {
    val request =
      LocationRequest.Builder(
        if (onTrip) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
        if (onTrip) TRIP_FIX_MS else IDLE_FIX_MS,
      )
        .setMaxUpdateDelayMillis(uploadEveryMs())
        .build()
    try {
      synchronized(callback) {
        if (!destroyed) fused.requestLocationUpdates(request, executor, callback)
      }
    } catch (error: SecurityException) {
      end(PERMISSION_MESSAGE)
    }
  }

  private fun uploadEveryMs() = if (onTrip) TRIP_UPLOAD_MS else IDLE_UPLOAD_MS

  private fun tick() {
    val current = shift ?: return
    if (System.currentTimeMillis() >= current.expiresAtMs) {
      end(ENDED_MESSAGE)
      return
    }
    val sent = fixes.toList()
    val sentAtMs = System.currentTimeMillis()
    val receipts = RiderOffers.pendingReceipts()
    val health = if (SystemClock.elapsedRealtime() - healthSentAtMs >= HEALTH_EVERY_MS) health() else null
    try {
      val body = JSONObject().put("fixes", JSONArray(sent.map { it.toJson() }))
        .apply { if (receipts.length() > 0) put("offerReceipts", receipts) }
        .apply { if (health != null) put("health", health) }
        .toString()
      val request =
        Request.Builder()
          .url("${current.apiBaseUrl}/api/v1/rider/locations")
          .header(CREDENTIAL_HEADER, current.credential)
          .post(body.toRequestBody(JSON))
          .build()
      http.newCall(request).execute().use { response ->
        when {
          response.code == 401 || response.code == 403 -> {
            end(ENDED_MESSAGE)
            return
          }
          !response.isSuccessful -> status("ERROR", RETRY_MESSAGE)
          else -> {
            fixes.clear()
            RiderOffers.receiptsSent((0 until receipts.length()).map { receipts.getJSONObject(it).getString("offerId") })
            if (health != null) {
              healthSentAtMs = SystemClock.elapsedRealtime()
              if (health.has("lastExitReason")) exitReason = null
            }
            if (!handle(JSONObject(response.body?.string() ?: "{}"), sentAtMs)) return
          }
        }
      }
    } catch (error: IOException) {
      // Fixes stay (newest 5) for the next tick.
      status("ERROR", RETRY_MESSAGE)
    } catch (error: Exception) {
      // A bad response must not end the upload loop.
      Log.w(TAG, "bad /locations call", error)
    }
    if (!executor.isShutdown) executor.schedule({ tick() }, uploadEveryMs(), TimeUnit.MILLISECONDS)
  }

  /** Applies a LocationBatchResponse; returns false when the server stopped the shift. */
  private fun handle(response: JSONObject, sentAtMs: Long): Boolean {
    if (response.optBoolean("stop")) {
      end(response.optString("stopReason").ifEmpty { ENDED_MESSAGE })
      return false
    }
    val offers = response.optJSONArray("offers") ?: JSONArray()
    val open = HashSet<String>()
    for (i in 0 until offers.length()) {
      val offer = offers.optJSONObject(i) ?: continue
      open.add(offer.optString("offerId"))
      RiderOffers.receive(this, offer.toString(), "locations")
    }
    RiderOffers.keepRinging(this, open, sentAtMs)

    val trip = response.optJSONObject("activeTrip")
    val step = trip?.optString("step").orEmpty()
    val signature = if (trip == null) "" else "${trip.optString("tripId")}:${trip.optInt("version")}"
    if (trip != null && signature != tripSignature) {
      RiderEvents.emit("riderTripChanged") {
        Arguments.createMap().apply {
          putString("tripId", trip.optString("tripId"))
          putString("step", step)
          putInt("version", trip.optInt("version"))
        }
      }
    }
    tripSignature = signature
    val nowOnTrip = trip != null && step !in ENDED_STEPS
    if (nowOnTrip != onTrip) {
      onTrip = nowOnTrip
      fused.removeLocationUpdates(callback)
      requestLocations()
    }
    // Connected either way; while offers can't ring the server sends none, so Home says why (blueprint A9).
    if (RiderOffers.canRing(this)) status("ONLINE", null) else status("ERROR", RING_OFF_MESSAGE, connected = true)
    return true
  }

  /**
   * The phone's health for the server (blueprint A5, A9), sent with an upload about once a minute: battery, charging,
   * power saver, whether an offer can ring, battery used and minutes spent unplugged since the service started, the
   * trip actions JS has waiting, and once why the app's last process ended.
   */
  private fun health(): JSONObject {
    val now = SystemClock.elapsedRealtime()
    val battery = getSystemService(BatteryManager::class.java)
    val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
    val charging = battery?.isCharging ?: false
    if (sampledAtMs != 0L && !charging && !sampledCharging) {
      unpluggedMs += now - sampledAtMs
      if (pct in 0..100 && sampledPct in 0..100 && sampledPct > pct) drainPct += sampledPct - pct
    }
    sampledAtMs = now
    sampledPct = pct
    sampledCharging = charging
    val health =
      JSONObject()
        .put("charging", charging)
        .put("powerSave", (getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode)
        .put("canRing", RiderOffers.canRing(this))
        .put("drainPct", drainPct)
        .put("unpluggedMin", unpluggedMs / 60_000)
    if (pct in 0..100) health.put("batteryPct", pct)
    queueStats?.let { (pending, oldestAtMs) ->
      health.put("queuePending", pending)
      if (pending > 0 && oldestAtMs > 0) health.put("queueOldestAgeS", ((System.currentTimeMillis() - oldestAtMs) / 1000).coerceAtLeast(0))
    }
    exitReason?.let { health.put("lastExitReason", it) }
    return health
  }

  /** Why the app's last process ended (Android 11 and later), e.g. "LOW_MEMORY at 2026-10-27T09:12:03.000Z"; null before. */
  private fun lastExitReason(): String? {
    if (Build.VERSION.SDK_INT < 30) return null
    return try {
      val info = getSystemService(ActivityManager::class.java)?.getHistoricalProcessExitReasons(packageName, 0, 1)?.firstOrNull()
        ?: return null
      val reason =
        when (info.reason) {
          ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
          ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
          ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
          ApplicationExitInfo.REASON_CRASH -> "CRASH"
          ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
          ApplicationExitInfo.REASON_ANR -> "ANR"
          ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
          ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE"
          ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
          ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
          ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
          ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
          ApplicationExitInfo.REASON_OTHER -> "OTHER"
          else -> "REASON_${info.reason}"
        }
      "$reason at ${iso(info.timestamp)}"
    } catch (error: Exception) {
      Log.w(TAG, "no exit reason", error)
      null
    }
  }

  /** connected: this call reached the server (ONLINE, or ERROR only because offers can't ring), so JS may send its queue. */
  private fun status(state: String, message: String?, connected: Boolean = state == "ONLINE") {
    // A call cut short by Go offline must not report ERROR after onDestroy's OFFLINE.
    if (destroyed) return
    RiderEvents.emit("riderStatus") {
      Arguments.createMap().apply {
        putString("state", state)
        putBoolean("connected", connected)
        lastFix?.let { putMap("lastFix", it.toMap()) }
        message?.let { putString("message", it) }
      }
    }
  }

  /** Stops the service; onDestroy reports OFFLINE with the message. A dead credential is forgotten. */
  private fun end(message: String, clearShift: Boolean = true) {
    if (clearShift) clearShift(this)
    stopMessage = message
    shift = null
    stopSelf()
  }

  /** Without it the upload timer stalls while the screen is off; held until the credential expires at most. */
  private fun holdWakeLock(shift: Shift) {
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CravesRider:online").apply {
      setReferenceCounted(false)
      acquire((shift.expiresAtMs - System.currentTimeMillis()).coerceIn(60_000L, MAX_SHIFT_MS))
    }
  }

  private fun ongoing(): Notification =
    NotificationCompat.Builder(this, RiderOffers.ONLINE_CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("You're online")
      .setContentText("Craves Rider shares your location while you're online.")
      .setContentIntent(RiderOffers.openAppIntent(this, null))
      .setOngoing(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()

  companion object {
    private const val TAG = "CravesRiderOnline"
    private const val NOTIFICATION_ID = 1
    private const val PREFS = "craves_rider_shift"
    private const val CREDENTIAL_HEADER = "X-Craves-Shift-Credential"
    private const val MAX_FIXES = 5
    private const val IDLE_UPLOAD_MS = 10_000L
    private const val TRIP_UPLOAD_MS = 15_000L
    private const val IDLE_FIX_MS = 10_000L
    private const val TRIP_FIX_MS = 3_000L
    private const val HEALTH_EVERY_MS = 60_000L
    private const val MAX_SHIFT_MS = 12 * 60 * 60_000L
    private val ENDED_STEPS = setOf("DELIVERED", "FAILED", "CANCELLED")
    private val JSON = "application/json; charset=utf-8".toMediaType()
    // shortcut: status messages are English only; JS shows them as given (like the server's stopReason).
    const val ENDED_MESSAGE = "Your shift has ended. Go online again to get orders."
    private const val RESTART_MESSAGE = "Craves Rider was closed by the phone. Open the app to get orders again."
    private const val PERMISSION_MESSAGE = "Allow location to go online."
    private const val RETRY_MESSAGE = "No internet. Retrying."
    private const val RING_OFF_MESSAGE = "Turn on notifications to get orders."

    private val http =
      OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .build()

    @Volatile var running = false
      private set

    @Volatile var lastFix: Fix? = null
      private set

    /** From JS (RiderOnlineModule.setQueueStats): trip actions waiting to sync, and the oldest one's Date.now(). */
    @Volatile var queueStats: Pair<Int, Long>? = null

    /** Saves the credential (or keeps the saved one when null) and starts the service; call it from the foreground. */
    fun start(context: Context, credential: String?, expiresAtMs: Long, apiBaseUrl: String): Boolean {
      if (credential != null) {
        prefs(context).edit()
          .putString("credential", credential)
          .putLong("expiresAtMs", expiresAtMs)
          .putString("apiBaseUrl", apiBaseUrl.trimEnd('/'))
          .apply()
      }
      if (loadShift(context) == null) return false
      ContextCompat.startForegroundService(context, Intent(context, RiderOnlineService::class.java))
      return true
    }

    fun stop(context: Context) {
      clearShift(context)
      context.stopService(Intent(context, RiderOnlineService::class.java))
    }

    /**
     * Sends a new FCM token with the shift credential (POST /devices; P1-13), on OkHttp's own thread, when a shift is
     * saved. JS sends it too when it runs; this covers a token that changes while JS isn't running.
     */
    fun registerToken(context: Context, token: String) {
      val shift = loadShift(context) ?: return
      val installationId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: return
      val body =
        JSONObject()
          .put("installationId", installationId)
          .put("fcmToken", token)
          .put("appVersion", BuildConfig.VERSION_NAME)
          .put("model", Build.MODEL)
          .toString()
      val request =
        Request.Builder()
          .url("${shift.apiBaseUrl}/api/v1/rider/devices")
          .header(CREDENTIAL_HEADER, shift.credential)
          .post(body.toRequestBody(JSON))
          .build()
      http.newCall(request).enqueue(
        object : Callback {
          override fun onFailure(call: Call, e: IOException) {
            Log.w(TAG, "new push token not sent; JS sends it on the next start", e)
          }

          override fun onResponse(call: Call, response: Response) {
            response.use { if (!it.isSuccessful) Log.w(TAG, "new push token refused: ${it.code}") }
          }
        },
      )
    }

    /** The saved shift, or null (and forgotten) once it has expired. */
    fun loadShift(context: Context): Shift? {
      val prefs = prefs(context)
      val credential = prefs.getString("credential", null) ?: return null
      val apiBaseUrl = prefs.getString("apiBaseUrl", null) ?: return null
      val expiresAtMs = prefs.getLong("expiresAtMs", 0)
      if (System.currentTimeMillis() >= expiresAtMs) {
        clearShift(context)
        return null
      }
      return Shift(credential, expiresAtMs, apiBaseUrl)
    }

    private fun clearShift(context: Context) {
      prefs(context).edit().clear().apply()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun iso(ms: Long): String =
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(ms))
  }
}
