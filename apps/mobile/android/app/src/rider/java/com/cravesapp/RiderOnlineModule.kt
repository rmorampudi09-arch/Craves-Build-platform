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
 * JS side of the online service and offer ringing. Events (RCTDeviceEventEmitter): riderOffer, riderTripChanged,
 * riderStatus, riderFcmToken. See docs/riders/NATIVE.md.
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
      promise.reject("LOCATION_PERMISSION", "Allow location to go online.")
      return
    }
    try {
      if (RiderOnlineService.start(reactContext, shiftCredential, expiresAtMs.toLong(), apiBaseUrl)) {
        promise.resolve(null)
        return
      }
      RiderEvents.emit("riderStatus") {
        Arguments.createMap().apply {
          putString("state", "OFFLINE")
          putString("message", RiderOnlineService.ENDED_MESSAGE)
        }
      }
      promise.reject("NO_SHIFT", RiderOnlineService.ENDED_MESSAGE)
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

  /** The trip actions JS has waiting to sync, for the phone's health report; oldestAtMs is the oldest one's Date.now(). */
  @ReactMethod
  fun setQueueStats(pending: Double, oldestAtMs: Double) {
    RiderOnlineService.queueStats = pending.toInt() to oldestAtMs.toLong()
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
