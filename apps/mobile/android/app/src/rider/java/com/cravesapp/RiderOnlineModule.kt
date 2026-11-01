package com.cravesapp

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.messaging.FirebaseMessaging

/**
 * JS side of the online service, offer ringing and the trip-step outbox. Events (RCTDeviceEventEmitter): riderOffer,
 * riderTripChanged, riderStatus, riderFcmToken, riderOutboxChanged, and from pushes riderAccount and riderTripEnded. See
 * docs/riders/NATIVE.md.
 */
class RiderOnlineModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    RiderEvents.react = reactContext
  }

  override fun getName(): String = "CravesRiderOnline"

  override fun invalidate() {
    if (RiderEvents.react === reactContext) RiderEvents.react = null
    super.invalidate()
  }

  /** A null credential resumes the saved shift (the app reopened while the server says online). */
  @ReactMethod
  fun start(shiftCredential: String?, expiresAtMs: Double, apiBaseUrl: String, promise: Promise) {
    val fine = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
      promise.reject("LOCATION_PERMISSION", RiderText.get(reactContext, R.string.rider_allow_location))
      return
    }
    try {
      if (RiderOnlineService.start(reactContext, shiftCredential, expiresAtMs.toLong(), apiBaseUrl)) {
        promise.resolve(null)
        return
      }
      val ended = RiderText.get(reactContext, R.string.rider_shift_ended)
      RiderEvents.emit("riderStatus") {
        Arguments.createMap().apply {
          putString("state", "OFFLINE")
          putString("message", ended)
        }
      }
      promise.reject("NO_SHIFT", ended)
    } catch (error: Exception) {
      // ForegroundServiceStartNotAllowedException when the app isn't in the foreground.
      promise.reject("START_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    RiderOnlineService.stop(reactContext)
    promise.resolve(null)
  }

  @ReactMethod
  fun testRing(promise: Promise) {
    RiderOffers.testRing(reactContext)
    promise.resolve(null)
  }

  /** An offer rings until answered: Accept, Decline or its screen closing stops it. */
  @ReactMethod
  fun stopRinging(offerId: String) {
    RiderOffers.stopRinging(reactContext, offerId)
  }

  /** The trip actions JS has waiting to sync, for the phone's health report; oldestAtMs is the oldest one's Date.now(). */
  @ReactMethod
  fun setQueueStats(pending: Double, oldestAtMs: Double) {
    RiderOnlineService.queueStats = pending.toInt() to oldestAtMs.toLong()
  }

  /** The language the app shows the rider (en, te or hi; P2-08): notifications and the service's messages follow it. */
  @ReactMethod
  fun setLanguage(language: String) {
    RiderText.setLanguage(reactContext, language)
  }

  // The native outbox of trip steps (P2-02, RiderOutbox): JSON text in and out. See docs/riders/NATIVE.md.

  /** Saves a step and sends it at once (options: accessToken or null, apiBaseUrl, riderId); {entryId, results, needsAuth}. */
  @ReactMethod
  fun outboxEnqueue(entryJson: String, optionsJson: String, promise: Promise) {
    RiderOutbox.enqueue(reactContext, entryJson, optionsJson, promise)
  }

  /** A pass over the waiting steps (options as outboxEnqueue, plus now and tripId); {results, needsAuth}. */
  @ReactMethod
  fun outboxFlush(optionsJson: String, promise: Promise) {
    RiderOutbox.flush(reactContext, optionsJson, promise)
  }

  /** The JS queue's steps and refusals moved in ({entries, refusals}); the OTPs come in the bodies and are sealed here. */
  @ReactMethod
  fun outboxImport(json: String, promise: Promise) {
    RiderOutbox.import(reactContext, json, promise)
  }

  /** {entries, refusals} as stored, never a sealed code; from memory, so it never waits for a send. */
  @ReactMethod
  fun outboxState(promise: Promise) {
    try {
      promise.resolve(RiderOutbox.state(reactContext))
    } catch (error: Exception) {
      promise.reject("RIDER_OUTBOX", error)
    }
  }

  /** The step is still waiting once the rider's tap is over: it now counts as captured offline. */
  @ReactMethod
  fun outboxDefer(entryId: String, promise: Promise) {
    try {
      RiderOutbox.defer(reactContext, entryId)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("RIDER_OUTBOX", error)
    }
  }

  @ReactMethod
  fun outboxDismissRefusal(tripId: String, promise: Promise) {
    try {
      RiderOutbox.dismissRefusal(reactContext, tripId)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("RIDER_OUTBOX", error)
    }
  }

  @ReactMethod
  fun lastFix(promise: Promise) {
    promise.resolve(RiderOnlineService.lastFix?.toMap())
  }

  @ReactMethod
  fun getFcmToken(promise: Promise) {
    try {
      FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token -> promise.resolve(token) }
        .addOnFailureListener { error -> promise.reject("FCM_TOKEN", error) }
    } catch (error: Exception) {
      // No Firebase app (a demo build's placeholder config).
      promise.reject("FCM_TOKEN", error)
    }
  }

  /** The offer whose notification opened the app, or one that arrived while JS wasn't running; null once expired. */
  @ReactMethod
  fun getPendingOffer(promise: Promise) {
    val intent = reactContext.currentActivity?.intent
    val json = intent?.getStringExtra(RiderOffers.EXTRA_OFFER)
    val fromTap = json?.let {
      RiderOffers.Received.parse(
        it,
        intent.getLongExtra(RiderOffers.EXTRA_RECEIVED_AT, 0),
        intent.getStringExtra(RiderOffers.EXTRA_CHANNEL) ?: "fcm",
      )
    }
    // Read once, so a JS reload doesn't open the same offer again.
    intent?.removeExtra(RiderOffers.EXTRA_OFFER)
    promise.resolve(RiderOffers.takePending(fromTap)?.toMap())
  }
}
