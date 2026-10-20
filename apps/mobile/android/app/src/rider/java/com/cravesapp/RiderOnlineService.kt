package com.cravesapp

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
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

  class Fix(val lat: Double, val lng: Double, val accuracyM: Float, val atMs: Long, val mock: Boolean) {
    fun toJson(): JSONObject =
      JSONObject()
        .put("lat", lat)
        .put("lng", lng)
        .put("accuracyM", accuracyM.toDouble())
        .put("at", iso(atMs))
        .put("mock", mock)

    fun toMap(): WritableMap =
      Arguments.createMap().apply {
        putDouble("lat", lat)
        putDouble("lng", lng)
        putDouble("accuracyM", accuracyM.toDouble())
        putString("at", iso(atMs))
        putBoolean("mock", mock)
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
    val fix = Fix(location.latitude, location.longitude, location.accuracy, location.time, mock)
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
    try {
      val body = JSONObject().put("fixes", JSONArray(sent.map { it.toJson() })).toString()
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
    status("ONLINE", null)
    return true
  }

  private fun status(state: String, message: String?) {
    // A call cut short by Go offline must not report ERROR after onDestroy's OFFLINE.
    if (destroyed) return
    RiderEvents.emit("riderStatus") {
      Arguments.createMap().apply {
        putString("state", state)
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
    private const val MAX_SHIFT_MS = 12 * 60 * 60_000L
    private val ENDED_STEPS = setOf("DELIVERED", "FAILED", "CANCELLED")
    private val JSON = "application/json; charset=utf-8".toMediaType()
    // shortcut: status messages are English only; JS shows them as given (like the server's stopReason).
    const val ENDED_MESSAGE = "Your shift has ended. Go online again to get orders."
    private const val RESTART_MESSAGE = "Craves Rider was closed by the phone. Open the app to get orders again."
    private const val PERMISSION_MESSAGE = "Allow location to go online."
    private const val RETRY_MESSAGE = "No internet. Retrying."

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
