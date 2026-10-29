package com.cravesapp

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import androidx.core.os.BundleCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * Fills in the sign-in code from its SMS with Android's SMS User Consent API (Google Play services). When an SMS with a
 * code arrives within 5 minutes of start(), Android asks the rider in its own sheet whether Craves Rider may read that
 * one message; with Allow, only its 6-digit code goes to JS (event riderSmsCode). No SMS permission, and MSG91's
 * template stays as it is: the no-tap SMS Retriever API would need this app's hash in the message.
 */
class RiderSmsCodeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var receiver: BroadcastReceiver? = null
  // Bumped by every stop (so by every start too): a start Play services answers late never listens after a newer one.
  private var generation = 0

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "CravesRiderSmsCode"

  /** Waits for the next SMS with a code. Resolves false where Play services can't (missing or too old). */
  @ReactMethod
  fun start(promise: Promise) {
    val mine = synchronized(this) {
      stopListening()
      generation
    }
    try {
      SmsRetriever.getClient(reactContext)
        .startSmsUserConsent(null)
        .addOnSuccessListener { promise.resolve(listenIfCurrent(mine)) }
        .addOnFailureListener { promise.resolve(false) }
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stop() {
    stopListening()
  }

  /** False when a stop or another start came first (the rider left the screen), or the receiver can't register. */
  @Synchronized
  private fun listenIfCurrent(mine: Int): Boolean = mine == generation && runCatching { listen() }.isSuccess

  private fun listen() {
    val consent = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
        val extras = intent.extras ?: return
        val status = BundleCompat.getParcelable(extras, SmsRetriever.EXTRA_STATUS, Status::class.java) ?: return
        // One message per start; after it, or after 5 minutes (TIMEOUT), the rider types the code.
        stopListening()
        if (status.statusCode != CommonStatusCodes.SUCCESS) return
        val ask = BundleCompat.getParcelable(extras, SmsRetriever.EXTRA_CONSENT_INTENT, Intent::class.java) ?: return
        // Intent redirection guard (Play's SMS User Consent guidance): only Play services' own sheet, granting no URIs.
        val target = ask.resolveActivity(context.packageManager)
        val grants = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        if (target?.packageName != PLAY_SERVICES || ask.flags and grants != 0) return
        try {
          reactContext.currentActivity?.startActivityForResult(ask, REQUEST_CONSENT)
        } catch (error: Exception) {
          // No screen to ask from (the app went to the background): the rider types the code.
        }
      }
    }
    ContextCompat.registerReceiver(
      reactContext,
      consent,
      IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
      SmsRetriever.SEND_PERMISSION,
      null,
      ContextCompat.RECEIVER_EXPORTED,
    )
    receiver = consent
  }

  @Synchronized
  private fun stopListening() {
    generation += 1
    receiver?.let { runCatching { reactContext.unregisterReceiver(it) } }
    receiver = null
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    // Deny keeps the screen as it is: the rider types the code.
    if (requestCode != REQUEST_CONSENT || resultCode != Activity.RESULT_OK) return
    val code = RiderSmsCode.codeIn(data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)) ?: return
    if (reactContext.hasActiveReactInstance()) reactContext.emitDeviceEvent(EVENT, code)
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun invalidate() {
    stopListening()
    reactContext.removeActivityEventListener(this)
    super.invalidate()
  }

  companion object {
    const val EVENT = "riderSmsCode"
    private const val PLAY_SERVICES = "com.google.android.gms"
    private const val REQUEST_CONSENT = 4127
  }
}

/** The code in the SMS the rider let the app read (no Android types, so it is tested on the JVM: RiderSmsCodeTest). */
object RiderSmsCode {
  /** Six digits standing alone in the message: the code, never part of a longer number. */
  private val CODE = Regex("(?:^|\\D)(\\d{6})(?:\\D|$)")

  fun codeIn(message: String?): String? = message?.let { CODE.find(it)?.groupValues?.get(1) }
}
