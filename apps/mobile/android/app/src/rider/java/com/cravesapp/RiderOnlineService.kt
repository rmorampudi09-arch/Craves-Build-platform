package com.cravesapp

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.AtomicFile
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
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
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

  /**
   * elapsedMs is the fix's SystemClock.elapsedRealtime time and boot the phone's boot count then: the server times the fix
   * from its age, not from atMs.
   */
  class Fix(val lat: Double, val lng: Double, val accuracyM: Float, val atMs: Long, val mock: Boolean, val elapsedMs: Long, val boot: Int) {
    /**
     * ageMs is worked out when the call is built, by the monotonic clock within the same boot (a fix kept on disk across a
     * reboot falls back to the wall clock), so a wrong phone clock doesn't matter (blueprint A6).
     */
    fun toJson(nowBoot: Int): JSONObject =
      JSONObject()
        .put("lat", lat)
        .put("lng", lng)
        .put("accuracyM", accuracyM.toDouble())
        .put("at", iso(atMs))
        .put("mock", mock)
        .put("ageMs", ageMs(nowBoot))

    fun ageMs(nowBoot: Int): Long =
      RiderOutboxCore.ageMs(atMs, elapsedMs, boot, System.currentTimeMillis(), SystemClock.elapsedRealtime(), nowBoot)

    /** As fixes.json keeps it (P2-03). */
    fun stored(): JSONObject =
      JSONObject()
        .put("lat", lat)
        .put("lng", lng)
        .put("accuracyM", accuracyM.toDouble())
        .put("atMs", atMs)
        .put("mock", mock)
        .put("elapsedMs", elapsedMs)
        .put("boot", boot)

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

    companion object {
      fun fromStored(json: JSONObject?): Fix? =
        try {
          json?.let {
            Fix(it.getDouble("lat"), it.getDouble("lng"), it.getDouble("accuracyM").toFloat(), it.getLong("atMs"), it.optBoolean("mock"),
              it.getLong("elapsedMs"), it.optInt("boot", -1))
          }
        } catch (error: Exception) {
          null
        }
    }
  }

  private lateinit var executor: ScheduledExecutorService
  private lateinit var fused: FusedLocationProviderClient
  /** The shift-long lock (until P2-10 is switched on) and the short one that covers each upload. */
  private var wakeLock: PowerManager.WakeLock? = null
  private var uploadLock: PowerManager.WakeLock? = null
  // On the executor thread: when the last upload started (elapsedRealtime) and the backup timer for the next one.
  private var lastUploadAt = 0L
  private var nextTick: ScheduledFuture<*>? = null
  @Volatile private var shift: Shift? = null
  @Volatile private var stopMessage: String? = null
  /** Set under the callback's lock in onDestroy, so the executor can't re-register location updates or report after it. */
  @Volatile private var destroyed = false
  // Touched only on the executor thread, which also receives the location callbacks. Unsent fixes, oldest first: one
  // call's worth dense, then one per 30 s, an hour at most (P2-03), kept in fixes.json while some wait.
  private val fixes = ArrayDeque<Fix>()
  /** How many fixes a call carries: the server's maxFixes (P2-03), 5 until a server says. */
  private var fixesPerCall = RiderOutboxCore.fixesPerCall(null)
  /** The upload period while waiting for offers: the server's nextPollSec (P2-04), 10 s until it says. */
  private var idleUploadMs = RiderOutboxCore.idleUploadMs(null)
  private var boot = -1
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
        // The fused provider wakes the phone for each batch, so uploads keep going with the screen off (P2-10).
        maybeUpload(force = false)
      }
    }

  private var networkWatched = false
  /** A new network sends the outbox's waiting trip steps at once, not at the next upload (P2-02a). */
  private val network =
    object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        RiderOutbox.flushInBackground(this@RiderOnlineService, skipBackoff = true)
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    executor = Executors.newSingleThreadScheduledExecutor()
    fused = LocationServices.getFusedLocationProviderClient(this)
    boot = RiderOutbox.bootCount(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground first: Android kills a service started with startForegroundService that doesn't call it in time.
    try {
      RiderOffers.createChannels(this)
      ServiceCompat.startForeground(this, NOTIFICATION_ID, ongoing(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } catch (error: Exception) {
      // A sticky restart from the background can't start a location service on Android 12+; the shift stays saved for the next app open.
      Log.w(TAG, "can't start in the foreground", error)
      end(text(R.string.rider_closed_by_phone), clearShift = false)
      return START_NOT_STICKY
    }
    val saved = loadShift(this)
    if (saved == null) {
      end(text(R.string.rider_shift_ended))
      return START_NOT_STICKY
    }
    val firstStart = shift == null
    shift = saved
    if (firstStart) {
      running = true
      // Back online, from the notice or from the launcher: "You're offline" no longer holds.
      RiderOffers.cancelNotice(this, RiderMessagingService.GO_ONLINE_TAG)
      holdWakeLock(saved)
      uploadLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CravesRider:upload")
        .apply { setReferenceCounted(false) }
      watchNetwork()
      executor.execute {
        exitReason = lastExitReason()
        // Fixes kept from before the phone killed the service, this shift's only, go first (P2-03).
        loadFixes(saved)
        requestLocations()
        maybeUpload(force = true)
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
    if (networkWatched) {
      try {
        getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(network)
      } catch (error: Exception) {
        Log.w(TAG, "network callback already gone", error)
      }
    }
    wakeLock?.takeIf { it.isHeld }?.release()
    uploadLock?.takeIf { it.isHeld }?.release()
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
    val fix = Fix(location.latitude, location.longitude, location.accuracy, location.time, mock, location.elapsedRealtimeNanos / 1_000_000, boot)
    // Behind (offline): the newest kept fix gives way unless it is 30 s from the one before, so an hour fits in 120.
    if (fixes.size >= 2 && RiderOutboxCore.replacesNewest(fixes.size, fixes[fixes.size - 1].atMs, fixes[fixes.size - 2].atMs)) {
      fixes.removeLast()
    }
    fixes.addLast(fix)
    while (fixes.size > RiderOutboxCore.MAX_FIXES_KEPT) fixes.removeFirst()
    lastFix = fix
  }

  /** Balanced power while waiting for offers; high accuracy on a trip, for the customer map and distance evidence. */
  private fun requestLocations() {
    val request =
      LocationRequest.Builder(
        if (onTrip) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
        // Idle fixes come at least as often as uploads are due, since each batch is what wakes the phone to upload.
        if (onTrip) TRIP_FIX_MS else minOf(IDLE_FIX_MS, idleUploadMs),
      )
        .setMaxUpdateDelayMillis(uploadEveryMs())
        .build()
    try {
      synchronized(callback) {
        if (!destroyed) fused.requestLocationUpdates(request, executor, callback)
      }
    } catch (error: SecurityException) {
      end(text(R.string.rider_allow_location))
    }
  }

  private fun uploadEveryMs() = if (onTrip) TRIP_UPLOAD_MS else idleUploadMs

  /**
   * Uploads when one is due: after a location batch, and on the timer as a backup (which stalls while the phone sleeps,
   * unless the shift-long lock is held). A short wake lock covers the call so the phone can't sleep mid-upload (P2-10).
   */
  private fun maybeUpload(force: Boolean) {
    if (shift == null || destroyed) return
    if (!force && SystemClock.elapsedRealtime() - lastUploadAt < uploadEveryMs() - DUE_SLACK_MS) return
    val lock = uploadLock
    lock?.acquire(UPLOAD_LOCK_MS)
    try {
      tick()
    } finally {
      if (lock?.isHeld == true) lock.release()
    }
  }

  private fun tick() {
    val current = shift ?: return
    lastUploadAt = SystemClock.elapsedRealtime()
    if (System.currentTimeMillis() >= current.expiresAtMs) {
      end(text(R.string.rider_shift_ended))
      return
    }
    // A fix over an hour old is no use to the server, which caps a fix's age there: dropped, never sent.
    fixes.removeAll { it.ageMs(boot) > RiderOutboxCore.MAX_FIX_AGE_MS }
    val sent = fixes.take(fixesPerCall)
    val sentAtMs = System.currentTimeMillis()
    val receipts = RiderOffers.pendingReceipts()
    val health = if (SystemClock.elapsedRealtime() - healthSentAtMs >= HEALTH_EVERY_MS) health() else null
    try {
      val body = JSONObject().put("fixes", JSONArray(sent.map { it.toJson(boot) }))
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
            end(text(R.string.rider_shift_ended))
            return
          }
          !response.isSuccessful -> {
            // A server that refused the batch may take fewer fixes (an older one takes 5): back to 5 until one says more.
            fixesPerCall = RiderOutboxCore.fixesPerCall(null)
            status("ERROR", text(R.string.rider_no_internet))
          }
          else -> {
            // The server's clock against the phone's, before this answer's offers ring: an offer ends at the server's expiresAt.
            response.headers.getDate("Date")?.let {
              RiderOffers.serverOffsetMs = RiderOffers.offsetMs(it.time, response.sentRequestAtMillis, response.receivedResponseAtMillis)
            }
            // The oldest went; newer ones wait for the next call. Nothing else touches fixes on this thread meanwhile.
            repeat(sent.size) { fixes.removeFirst() }
            RiderOffers.receiptsSent((0 until receipts.length()).map { receipts.getJSONObject(it).getString("offerId") })
            if (health != null) {
              healthSentAtMs = SystemClock.elapsedRealtime()
              if (health.has("lastExitReason")) exitReason = null
            }
            if (!handle(JSONObject(response.body?.string() ?: "{}"), sentAtMs)) return
            // The upload reached the server: the outbox's waiting trip steps go now, on its own thread (P2-02a).
            RiderOutbox.flushInBackground(this, skipBackoff = false)
          }
        }
      }
    } catch (error: IOException) {
      // Fixes stay, thinned, for the next tick.
      status("ERROR", text(R.string.rider_no_internet))
    } catch (error: Exception) {
      // A bad response must not end the upload loop.
      Log.w(TAG, "bad /locations call", error)
    }
    // After onDestroy (Go offline mid-call) the file is the stopped shift's: leave it as clearShift left it.
    if (!destroyed) saveFixes()
    // One backup timer at a time: an upload on a location batch moves it on.
    nextTick?.cancel(false)
    if (!executor.isShutdown) nextTick = executor.schedule({ maybeUpload(force = true) }, uploadEveryMs(), TimeUnit.MILLISECONDS)
  }

  /** Applies a LocationBatchResponse; returns false when the server stopped the shift. */
  private fun handle(response: JSONObject, sentAtMs: Long): Boolean {
    // An answer that arrives after Go offline (onDestroy) rings nothing and takes no lock.
    if (destroyed) return false
    if (response.optBoolean("stop")) {
      end(RiderText.fromServer(this, response.optString("stopReason")) ?: text(R.string.rider_shift_ended))
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

    fixesPerCall = RiderOutboxCore.fixesPerCall(response.intOrNull("maxFixes"))
    val idle = RiderOutboxCore.idleUploadMs(response.intOrNull("nextPollSec"))
    // P2-10: while the server says so, uploads ride on location batches with short locks, not one lock for the whole shift.
    if (response.optBoolean("callbackUploads")) {
      wakeLock?.takeIf { it.isHeld }?.release()
    } else {
      // Under the lock onDestroy takes to set destroyed, so a lock taken here is one onDestroy then releases.
      synchronized(callback) {
        if (!destroyed && wakeLock?.isHeld != true) shift?.let { holdWakeLock(it) }
      }
    }

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
      // Ops, the customer or the watchdog ended it: say so with the screen off too (blueprint A7). Once per trip: a TRIP_ENDED
      // push that came first has already said why.
      if (step == "CANCELLED" && RiderOffers.firstEnd(trip.optString("tripId"))) {
        RiderOffers.notice(this, RiderOffers.TRIP_ENDED_TAG, text(R.string.rider_trip_cancelled_title), text(R.string.rider_trip_cancelled_body))
      }
    }
    tripSignature = signature
    val nowOnTrip = trip != null && step !in ENDED_STEPS
    // The batch delay follows the upload period: ask again when the trip starts or ends, or the idle period changed.
    val relocate = nowOnTrip != onTrip || (!nowOnTrip && idle != idleUploadMs)
    onTrip = nowOnTrip
    idleUploadMs = idle
    if (relocate) {
      fused.removeLocationUpdates(callback)
      requestLocations()
    }
    // Connected either way; while offers can't ring the server sends none, so Home says why (blueprint A9).
    if (RiderOffers.canRing(this)) status("ONLINE", null) else status("ERROR", text(R.string.rider_notifications_off), connected = true)
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
    // Steps waiting in JS's queue (as JS last reported) and in the native outbox (P2-02).
    val reported = queueStats
    val (outboxPending, outboxOldestAtMs) = RiderOutbox.stats(this)
    if (reported != null || outboxPending > 0) {
      val pending = (reported?.first ?: 0) + outboxPending
      val oldestAtMs = listOfNotNull(reported?.second, outboxOldestAtMs).filter { it > 0 }.minOrNull() ?: 0L
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

  /** Writes the unsent fixes to fixes.json while some wait (offline), so a kill leaves no gap; deletes it once all went. */
  private fun saveFixes() {
    val file = fixesFile(this)
    try {
      if (fixes.isEmpty()) {
        if (file.baseFile.exists()) file.delete()
        return
      }
      val json = JSONObject().put("v", 1).put("shiftExpiresAtMs", shift?.expiresAtMs ?: 0L).put("fixes", JSONArray(fixes.map { it.stored() }))
      val out = file.startWrite()
      try {
        out.write(json.toString().toByteArray(Charsets.UTF_8))
        file.finishWrite(out)
      } catch (error: IOException) {
        file.failWrite(out)
        throw error
      }
    } catch (error: Exception) {
      Log.w(TAG, "unsent fixes not kept on disk", error)
    }
  }

  /** The fixes fixes.json kept for this shift (another shift's are dropped), before any new one. */
  private fun loadFixes(current: Shift) {
    try {
      val json = JSONObject(String(fixesFile(this).readFully(), Charsets.UTF_8))
      if (json.optLong("shiftExpiresAtMs") != current.expiresAtMs) return
      val saved = json.optJSONArray("fixes") ?: return
      (0 until saved.length()).mapNotNull { Fix.fromStored(saved.optJSONObject(it)) }.takeLast(RiderOutboxCore.MAX_FIXES_KEPT).forEach { fixes.addLast(it) }
    } catch (error: FileNotFoundException) {
      // Nothing kept.
    } catch (error: Exception) {
      Log.w(TAG, "kept fixes unreadable", error)
    }
  }

  private fun watchNetwork() {
    try {
      getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(network)
      networkWatched = true
    } catch (error: Exception) {
      // The steps still go after the next upload.
      Log.w(TAG, "no network callback", error)
    }
  }

  /**
   * Without it the backup timer stalls while the screen is off; held until the credential expires at most, unless the server
   * switches phones to uploads on location batches (P2-10, callbackUploads).
   */
  private fun holdWakeLock(shift: Shift) {
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CravesRider:online").apply {
      setReferenceCounted(false)
      acquire((shift.expiresAtMs - System.currentTimeMillis()).coerceIn(60_000L, MAX_SHIFT_MS))
    }
  }

  /** Words in the rider's app language (P2-08). */
  private fun text(id: Int) = RiderText.get(this, id)

  private fun ongoing(): Notification =
    NotificationCompat.Builder(this, RiderOffers.ONLINE_CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(text(R.string.rider_online_title))
      .setContentText(text(R.string.rider_online_body))
      .setContentIntent(RiderOffers.openAppIntent(this, null))
      .setOngoing(true)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()

  companion object {
    private const val TAG = "CravesRiderOnline"
    private const val NOTIFICATION_ID = 1
    private const val PREFS = "craves_rider_shift"
    private const val CREDENTIAL_HEADER = "X-Craves-Shift-Credential"
    private const val TRIP_UPLOAD_MS = 15_000L
    /** A batch a little early still uploads. */
    private const val DUE_SLACK_MS = 2_000L
    /** The most one upload keeps the phone awake: the call's own 15 s timeout and its answer. */
    private const val UPLOAD_LOCK_MS = 20_000L
    private const val IDLE_FIX_MS = 10_000L
    private const val TRIP_FIX_MS = 3_000L
    private const val HEALTH_EVERY_MS = 60_000L
    private const val MAX_SHIFT_MS = 12 * 60 * 60_000L
    private val ENDED_STEPS = setOf("DELIVERED", "FAILED", "CANCELLED")
    private val JSON = "application/json; charset=utf-8".toMediaType()

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
      // The shift's unsent fixes go with it: the server takes none after its end.
      fixesFile(context).delete()
    }

    private fun fixesFile(context: Context) = AtomicFile(File(File(context.filesDir, "rider").apply { mkdirs() }, "fixes.json"))

    private fun JSONObject.intOrNull(name: String): Int? = if (isNull(name)) null else optInt(name)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun iso(ms: Long): String =
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(ms))
  }
}
