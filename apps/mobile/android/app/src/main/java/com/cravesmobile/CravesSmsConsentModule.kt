package com.cravesapp

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import androidx.core.os.BundleCompat
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * SMS User Consent: when the OTP SMS arrives, Android asks the user once whether Craves may read
 * that one message. No SMS permission and no app hash in the MSG91/DLT template are needed.
 */
class CravesSmsConsentModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pending: Promise? = null
  private var receiver: BroadcastReceiver? = null

  private val activityListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != CONSENT_REQUEST) return
        val message = data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
        if (resultCode == Activity.RESULT_OK && message != null) {
          settle { it.resolve(message) }
        } else {
          settle { it.reject("SMS_CONSENT_DENIED", "The message was not shared.") }
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName() = "CravesSmsConsent"

  /** Resolves with the next SMS the user agrees to share; rejects on deny, 5-minute timeout or cancel. */
  @ReactMethod
  @Synchronized
  fun awaitMessage(promise: Promise) {
    settle { it.reject("SMS_CONSENT_REPLACED", "A newer request replaced this one.") }
    pending = promise
    val smsReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
          val extras = intent.extras ?: return
          val status = BundleCompat.getParcelable(extras, SmsRetriever.EXTRA_STATUS, Status::class.java)
          when (status?.statusCode) {
            CommonStatusCodes.SUCCESS ->
              showConsent(
                BundleCompat.getParcelable(extras, SmsRetriever.EXTRA_CONSENT_INTENT, Intent::class.java),
              )
            CommonStatusCodes.TIMEOUT ->
              settle { it.reject("SMS_CONSENT_TIMEOUT", "No message arrived in time.") }
          }
        }
      }
    receiver = smsReceiver
    ContextCompat.registerReceiver(
      reactContext,
      smsReceiver,
      IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
      SmsRetriever.SEND_PERMISSION,
      null,
      ContextCompat.RECEIVER_EXPORTED,
    )
    SmsRetriever.getClient(reactContext).startSmsUserConsent(null).addOnFailureListener { error ->
      settle { it.reject("SMS_CONSENT_UNAVAILABLE", error.message, error) }
    }
  }

  @ReactMethod
  fun cancel() {
    settle { it.reject("SMS_CONSENT_CANCELLED", "Stopped waiting for the message.") }
  }

  private fun showConsent(intent: Intent?) {
    val activity = reactContext.currentActivity
    // Only launch Play services' own consent screen, never a redirected intent that grants URI access.
    val target = intent?.resolveActivity(reactContext.packageManager)
    val grantsUriAccess =
      intent != null &&
        intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0
    if (activity == null || intent == null || target?.packageName != PLAY_SERVICES || grantsUriAccess) {
      settle { it.reject("SMS_CONSENT_UNAVAILABLE", "The consent screen could not be shown.") }
      return
    }
    activity.startActivityForResult(intent, CONSENT_REQUEST)
  }

  /** Settles the waiting JS call once and stops listening. */
  @Synchronized
  private fun settle(action: (Promise) -> Unit) {
    receiver?.let { runCatching { reactContext.unregisterReceiver(it) } }
    receiver = null
    pending?.let(action)
    pending = null
  }

  override fun invalidate() {
    cancel()
    reactContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  private companion object {
    const val CONSENT_REQUEST = 4721
    const val PLAY_SERVICES = "com.google.android.gms"
  }
}
