package com.cravesapp

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Offers from both channels (FCM and the /locations response): first arrival wins, rings, and reaches JS.
 * An offer that arrives while JS isn't running waits for getPendingOffer().
 */
object RiderOffers {
  /** Rings Craves's own sound (res/raw/offer_ring.wav). A channel's sound is fixed once made, so it has a new id (app 1.3.0). */
  const val OFFERS_CHANNEL = "rider_offers_ring"
  /** The first offers channel, which rang the phone's ringtone; deleted when the new one is made. */
  private const val OLD_OFFERS_CHANNEL = "rider_offers"
  const val ONLINE_CHANNEL = "rider_online"
  /** Trip and shift notices that aren't offers: "Trip cancelled", "You're offline" (default importance, no ringtone). */
  const val TRIP_CHANNEL = "rider_trip"
  /** One notice says a trip ended, whether /locations or the TRIP_ENDED push said so first. */
  const val TRIP_ENDED_TAG = "trip-cancelled"
  const val EXTRA_OFFER = "craves.rider.offer"
  const val EXTRA_RECEIVED_AT = "craves.rider.offerReceivedAtMs"
  const val EXTRA_CHANNEL = "craves.rider.offerChannel"
  private const val TAG = "CravesRiderOffer"
  private const val OFFER_NOTIFICATION_ID = 2
  private const val NOTICE_NOTIFICATION_ID = 3
  private const val TEST_TAG = "test-ring"
  private const val KEEP_SEEN_MS = 10 * 60_000L
  private val RING = longArrayOf(0, 800, 400, 800, 400, 800, 400, 800)

  /** offerId to when and through which channel it first arrived, for dedupe across channels. */
  private val seen = HashMap<String, Pair<Long, String>>()
  private var pending: Received? = null
  private const val MAX_RECEIPTS = 10
  /** First arrivals the server hasn't been told about (offer receipts, blueprint A5): offerId to channel and elapsedRealtime. */
  private val receipts = LinkedHashMap<String, Pair<String, Long>>()
  /** Trips whose end a notice already told the rider of, so a later one from the other source doesn't repeat it. */
  private val endsTold = LinkedHashSet<String>()
  /** The server's clock minus the phone's, in ms, from the last /locations answer (RiderOnlineService); null until one. */
  @Volatile var serverOffsetMs: Long? = null
  private val ISO_INSTANT = Regex("""(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)""")

  class Received(val json: String, val offerId: String, val receivedAtMs: Long, val channel: String, val deadlineMs: Long) {
    fun toMap(): WritableMap =
      Arguments.createMap().apply {
        putString("offer", json)
        putDouble("receivedAtMs", receivedAtMs.toDouble())
        putDouble("deadlineMs", deadlineMs.toDouble())
        putString("channel", channel)
      }

    companion object {
      /** The countdown ends at deadlineMs: the server's expiresAt on the phone's clock, never later than expiresInSec after arrival. */
      fun parse(json: String, receivedAtMs: Long, channel: String): Received? {
        val offer = try {
          JSONObject(json)
        } catch (error: JSONException) {
          return null
        }
        val offerId = offer.optString("offerId")
        val expiresInSec = offer.optInt("expiresInSec", 0)
        if (offerId.isEmpty() || expiresInSec <= 0) return null
        return Received(json, offerId, receivedAtMs, channel, deadlineMs(receivedAtMs, expiresInSec, offer.optString("expiresAt"), serverOffsetMs))
      }
    }
  }

  /**
   * When an offer ends by the phone's clock: expiresInSec after it arrived, or sooner when the server's expiresAt, moved onto
   * the phone's clock by offsetMs, says so (a push that lands 8 s late has 8 s less). Arrival-based without an offset or a
   * readable expiresAt.
   */
  fun deadlineMs(receivedAtMs: Long, expiresInSec: Int, expiresAt: String?, offsetMs: Long?): Long {
    val byArrival = receivedAtMs + expiresInSec * 1000L
    val serverMs = isoMs(expiresAt)
    return if (serverMs == null || offsetMs == null) byArrival else minOf(byArrival, serverMs - offsetMs)
  }

  /**
   * The server's clock minus the phone's, from one call: its Date header against the midpoint of sending and answer. Date
   * has whole seconds, so its middle (+500 ms) is the best guess.
   */
  fun offsetMs(serverDateMs: Long, sentAtMs: Long, receivedAtMs: Long): Long = serverDateMs + 500 - (sentAtMs + receivedAtMs) / 2

  /** An ISO-8601 instant in epoch ms, as the server's Jackson writes Instant (0 to 9 decimals); null when it isn't one. */
  fun isoMs(text: String?): Long? {
    val (seconds, fraction, zone) = ISO_INSTANT.matchEntire(text ?: return null)?.destructured ?: return null
    return try {
      // Milliseconds only: SimpleDateFormat would read the 6 decimals of "40.123456" as 123456 ms.
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).parse("$seconds.${fraction.padEnd(3, '0').take(3)}$zone")?.time
    } catch (error: ParseException) {
      null
    }
  }

  fun createChannels(context: Context) {
    val manager = NotificationManagerCompat.from(context)
    manager.deleteNotificationChannel(OLD_OFFERS_CHANNEL)
    // Names in the rider's language; createNotificationChannels renames a channel that already exists.
    val offers = NotificationChannelCompat.Builder(OFFERS_CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
      .setName(RiderText.get(context, R.string.rider_channel_offers))
      .setSound(ringUri(context), ringAudio())
      .setVibrationEnabled(true)
      .setVibrationPattern(RING)
      .build()
    val online = NotificationChannelCompat.Builder(ONLINE_CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
      .setName(RiderText.get(context, R.string.rider_channel_online))
      .build()
    val trip = NotificationChannelCompat.Builder(TRIP_CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
      .setName(RiderText.get(context, R.string.rider_channel_trip))
      .build()
    manager.createNotificationChannelsCompat(listOf(offers, online, trip))
  }

  /** Returns true when this is the first arrival of a valid, unexpired offer. */
  fun receive(context: Context, json: String, channel: String, title: String? = null, body: String? = null): Boolean {
    val now = System.currentTimeMillis()
    val offer = Received.parse(json, now, channel) ?: return false
    if (offer.deadlineMs <= now) {
      // It landed after the server's own deadline (a slow push): nothing to ring or show.
      Log.i(TAG, "offer ${offer.offerId} via $channel arrived after its deadline")
      return false
    }
    synchronized(this) {
      seen.values.removeAll { now - it.first > KEEP_SEEN_MS }
      val first = seen[offer.offerId]
      if (first != null) {
        // /locations repeats an open offer every call; only the other channel's arrival is worth a line.
        if (first.second != channel) Log.i(TAG, "offer ${offer.offerId} also via $channel, ${now - first.first} ms after ${first.second}")
        return false
      }
      seen[offer.offerId] = now to channel
      receipts[offer.offerId] = channel to SystemClock.elapsedRealtime()
      while (receipts.size > MAX_RECEIPTS) receipts.remove(receipts.keys.first())
    }
    Log.i(TAG, "offer ${offer.offerId} first via $channel")
    val (ownTitle, ownBody) = words(context, offer.json)
    ring(context, offer, RiderText.fromServer(context, title) ?: ownTitle, RiderText.fromServer(context, body) ?: ownBody)
    if (!RiderEvents.emit("riderOffer") { offer.toMap() }) {
      synchronized(this) { pending = offer }
    }
    return true
  }

  /** The newest unexpired offer JS hasn't seen: the one whose notification opened the app, or one that arrived without JS. */
  fun takePending(fromTap: Received?): Received? {
    val held = synchronized(this) { pending.also { pending = null } }
    val now = System.currentTimeMillis()
    return listOfNotNull(fromTap, held).filter { it.deadlineMs > now }.maxByOrNull { it.receivedAtMs }
  }

  /**
   * Whether MainActivity was opened by a ringing offer's full-screen alert, to show over the lock screen. Any app can set a
   * launch intent's extras, so only an offer this phone rang and that hasn't ended counts.
   */
  fun ringing(intent: Intent?): Boolean {
    if (intent == null) return false
    val offer = Received.parse(intent.getStringExtra(EXTRA_OFFER) ?: return false, intent.getLongExtra(EXTRA_RECEIVED_AT, 0), "fcm")
      ?: return false
    return offer.deadlineMs > System.currentTimeMillis() && synchronized(this) { offer.offerId in seen }
  }

  /** Whether an offer may open over the lock screen: Android 14+ asks the rider (phone setup advises it); earlier ones allow it. */
  fun canShowFullScreen(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() == true
  }

  /** True the first time a notice tells of this trip's end: /locations and the TRIP_ENDED push both can. */
  fun firstEnd(tripId: String): Boolean =
    synchronized(this) {
      endsTold.add(tripId).also { while (endsTold.size > MAX_RECEIPTS) endsTold.remove(endsTold.first()) }
    }

  /**
   * Stops ringing for offers the server no longer lists (accepted, declined, taken or expired). Offers that first
   * arrived after the request was sent are left alone: that response can't know about them.
   */
  fun keepRinging(context: Context, openOfferIds: Set<String>, requestSentAtMs: Long) {
    val gone = synchronized(this) { seen.filter { (id, first) -> first.first < requestSentAtMs && id !in openOfferIds }.keys }
    val manager = NotificationManagerCompat.from(context)
    gone.forEach { manager.cancel(it, OFFER_NOTIFICATION_ID) }
  }

  /** The rider answered the offer on screen (or the screen closed): its ring stops now, not at the next /locations answer. */
  fun stopRinging(context: Context, offerId: String) {
    NotificationManagerCompat.from(context).cancel(offerId, OFFER_NOTIFICATION_ID)
  }

  /**
   * The receipts for the next /locations call: offerId, channel and ageMs, how long ago the offer arrived by the
   * monotonic clock, worked out now so the phone's wall clock plays no part.
   */
  fun pendingReceipts(): JSONArray {
    val now = SystemClock.elapsedRealtime()
    return synchronized(this) {
      JSONArray(receipts.map { (offerId, arrival) ->
        JSONObject().put("offerId", offerId).put("channel", arrival.first).put("ageMs", now - arrival.second)
      })
    }
  }

  /** Forgets the receipts a successful /locations call carried; any that arrived meanwhile stay for the next call. */
  fun receiptsSent(offerIds: Collection<String>) {
    synchronized(this) { offerIds.forEach { receipts.remove(it) } }
  }

  /**
   * A notice on rider_trip that opens the app when tapped: "Trip cancelled" (P1-12), "You're offline" (P1-13). One per
   * tag, so a newer notice of the same kind replaces the last. Nothing is posted while notifications are off.
   */
  fun notice(context: Context, tag: String, title: String, body: String) {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Log.w(TAG, "notifications are not allowed; $tag can't be shown")
      return
    }
    createChannels(context)
    val notification = NotificationCompat.Builder(context, TRIP_CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(openAppIntent(context, null))
      .setAutoCancel(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
    NotificationManagerCompat.from(context).notify(tag, NOTICE_NOTIFICATION_ID, notification)
  }

  /** Takes a notice down: "You're offline" once the service runs again, however the rider came back. */
  fun cancelNotice(context: Context, tag: String) {
    NotificationManagerCompat.from(context).cancel(tag, NOTICE_NOTIFICATION_ID)
  }

  /** Whether an offer can ring now: the app's notifications are on and the offers channel is still at high importance. */
  fun canRing(context: Context): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT < 26) return true
    // The channel is made when the service first starts; make it now so a phone that never went online can pass setup.
    val channel = manager.getNotificationChannelCompat(OFFERS_CHANNEL)
      ?: run { createChannels(context); manager.getNotificationChannelCompat(OFFERS_CHANNEL) } ?: return false
    return channel.importance >= NotificationManagerCompat.IMPORTANCE_HIGH
  }

  /** Rings once on the offers channel, with its sound and vibration; an offer rings on until answered. */
  fun testRing(context: Context) {
    post(context, TEST_TAG, RiderText.get(context, R.string.rider_test_ring_title), RiderText.get(context, R.string.rider_test_ring_body),
      15_000L, openAppIntent(context, null), offer = false)
  }

  fun openAppIntent(context: Context, offer: Received?): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    if (offer != null) {
      intent.putExtra(EXTRA_OFFER, offer.json)
        .putExtra(EXTRA_RECEIVED_AT, offer.receivedAtMs)
        .putExtra(EXTRA_CHANNEL, offer.channel)
    }
    // One request code per offer, so a second offer's extras don't overwrite the first one's.
    return PendingIntent.getActivity(
      context,
      offer?.offerId?.hashCode() ?: 0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Rings even with the screen off: the high-importance channel plays the sound and vibration, not JS. */
  private fun ring(context: Context, offer: Received, title: String, body: String) {
    post(context, offer.offerId, title, body, offer.deadlineMs - offer.receivedAtMs, openAppIntent(context, offer), offer = true)
  }

  /** The heading and line the server sends in English ("New order: ₹62", "Banjara Hills to Jubilee Hills"), from the offer itself, in the rider's language. */
  private fun words(context: Context, json: String): Pair<String, String> {
    val offer = JSONObject(json)
    val pay = offer.optLong("payPaise", -1L)
    val from = offer.optString("kitchenArea")
    val to = offer.optString("customerLocality")
    val title = if (pay >= 0) RiderText.get(context, R.string.rider_offer_title_pay, RiderText.rupees(pay))
      else RiderText.get(context, R.string.rider_offer_title)
    val body = if (from.isNotEmpty() && to.isNotEmpty()) RiderText.get(context, R.string.rider_offer_route, from, to)
      else RiderText.get(context, R.string.rider_offer_body)
    return title to body
  }

  private fun post(context: Context, tag: String, title: String, body: String, timeoutMs: Long, open: PendingIntent, offer: Boolean) {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Log.w(TAG, "notifications are not allowed; $tag can't ring")
      return
    }
    createChannels(context)
    val builder = NotificationCompat.Builder(context, OFFERS_CHANNEL)
      // shortcut: the launcher icon as the small icon (a white blob on some phones); add a monochrome icon with the rider icons.
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(open)
      .setAutoCancel(true)
      .setTimeoutAfter(timeoutMs)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      // Android 7 has no channels: these three give it the same ring.
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setSound(ringUri(context))
      .setVibrate(RING)
    // On a locked or sleeping phone the offer screen opens by itself; refused (Android 14+), it stays a heads-up.
    if (offer && canShowFullScreen(context)) builder.setFullScreenIntent(open, true)
    val notification = builder.build()
    // An offer rings and vibrates over and over until it is answered or times out. Android 7 has no setTimeoutAfter, so
    // there it rings once: on and on, it could outlast the offer.
    if (offer && Build.VERSION.SDK_INT >= 26) notification.flags = notification.flags or Notification.FLAG_INSISTENT
    NotificationManagerCompat.from(context).notify(tag, OFFER_NOTIFICATION_ID, notification)
  }

  /** By name, not id: a channel keeps its sound's URI, and a later build may number the resource differently. */
  private fun ringUri(context: Context): Uri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/offer_ring")

  private fun ringAudio(): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
}
