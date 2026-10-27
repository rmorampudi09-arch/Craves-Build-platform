package com.cravesapp

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Offers from both channels (FCM and the /locations response): first arrival wins, rings, and reaches JS.
 * An offer that arrives while JS isn't running waits for getPendingOffer().
 */
object RiderOffers {
  const val OFFERS_CHANNEL = "rider_offers"
  const val ONLINE_CHANNEL = "rider_online"
  const val EXTRA_OFFER = "craves.rider.offer"
  const val EXTRA_RECEIVED_AT = "craves.rider.offerReceivedAtMs"
  const val EXTRA_CHANNEL = "craves.rider.offerChannel"
  private const val TAG = "CravesRiderOffer"
  private const val OFFER_NOTIFICATION_ID = 2
  private const val TEST_TAG = "test-ring"
  private const val KEEP_SEEN_MS = 10 * 60_000L
  private val RING = longArrayOf(0, 800, 400, 800, 400, 800, 400, 800)

  // shortcut: notification copy is English only; move to strings.xml with te/hi when native screens are translated.
  private const val DEFAULT_TITLE = "New order"
  private const val DEFAULT_BODY = "Tap to see the offer."

  /** offerId to when and through which channel it first arrived, for dedupe across channels. */
  private val seen = HashMap<String, Pair<Long, String>>()
  private var pending: Received? = null
  private const val MAX_RECEIPTS = 10
  /** First arrivals the server hasn't been told about (offer receipts, blueprint A5): offerId to channel and elapsedRealtime. */
  private val receipts = LinkedHashMap<String, Pair<String, Long>>()

  class Received(val json: String, val offerId: String, val receivedAtMs: Long, val channel: String, val deadlineMs: Long) {
    fun toMap(): WritableMap =
      Arguments.createMap().apply {
        putString("offer", json)
        putDouble("receivedAtMs", receivedAtMs.toDouble())
        putString("channel", channel)
      }

    companion object {
      /** The countdown runs from the receive time plus expiresInSec, never from the phone clock against expiresAt. */
      fun parse(json: String, receivedAtMs: Long, channel: String): Received? {
        val offer = try {
          JSONObject(json)
        } catch (error: JSONException) {
          return null
        }
        val offerId = offer.optString("offerId")
        val expiresInSec = offer.optInt("expiresInSec", 0)
        if (offerId.isEmpty() || expiresInSec <= 0) return null
        return Received(json, offerId, receivedAtMs, channel, receivedAtMs + expiresInSec * 1000L)
      }
    }
  }

  fun createChannels(context: Context) {
    val offers = NotificationChannelCompat.Builder(OFFERS_CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
      .setName("Order offers")
      .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), ringAudio())
      .setVibrationEnabled(true)
      .setVibrationPattern(RING)
      .build()
    val online = NotificationChannelCompat.Builder(ONLINE_CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
      .setName("Online status")
      .build()
    NotificationManagerCompat.from(context).createNotificationChannelsCompat(listOf(offers, online))
  }

  /** Returns true when this is the first arrival of a valid, unexpired offer. */
  fun receive(context: Context, json: String, channel: String, title: String? = null, body: String? = null): Boolean {
    val now = System.currentTimeMillis()
    val offer = Received.parse(json, now, channel) ?: return false
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
    ring(context, offer, title ?: DEFAULT_TITLE, body ?: DEFAULT_BODY)
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
   * Stops ringing for offers the server no longer lists (accepted, declined, taken or expired). Offers that first
   * arrived after the request was sent are left alone: that response can't know about them.
   */
  fun keepRinging(context: Context, openOfferIds: Set<String>, requestSentAtMs: Long) {
    val gone = synchronized(this) { seen.filter { (id, first) -> first.first < requestSentAtMs && id !in openOfferIds }.keys }
    val manager = NotificationManagerCompat.from(context)
    gone.forEach { manager.cancel(it, OFFER_NOTIFICATION_ID) }
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

  /** Whether an offer can ring now: the app's notifications are on and the offers channel is still at high importance. */
  fun canRing(context: Context): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT < 26) return true
    val channel = manager.getNotificationChannelCompat(OFFERS_CHANNEL) ?: return false
    return channel.importance >= NotificationManagerCompat.IMPORTANCE_HIGH
  }

  fun testRing(context: Context) {
    post(context, TEST_TAG, "Test ring", "This is how an order offer rings.", 15_000L, openAppIntent(context, null))
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
    post(context, offer.offerId, title, body, offer.deadlineMs - offer.receivedAtMs, openAppIntent(context, offer))
  }

  private fun post(context: Context, tag: String, title: String, body: String, timeoutMs: Long, open: PendingIntent) {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Log.w(TAG, "notifications are not allowed; $tag can't ring")
      return
    }
    createChannels(context)
    val notification = NotificationCompat.Builder(context, OFFERS_CHANNEL)
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
      .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
      .setVibrate(RING)
      .build()
    NotificationManagerCompat.from(context).notify(tag, OFFER_NOTIFICATION_ID, notification)
  }

  private fun ringAudio(): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
}
