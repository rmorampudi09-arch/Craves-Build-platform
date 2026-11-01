package com.cravesapp

import com.facebook.react.bridge.Arguments
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * High-priority, data-only pushes from notification-service, each posting a visible notification (or FCM deprioritises
 * later pushes): type=OFFER with offerId, offer (Offer JSON), title, body; type=GO_ONLINE (P1-13) when the shift is open
 * but the phone stopped calling, whose tap opens the app so Home resumes the shift; type=ACCOUNT (P6-04) with decision
 * APPROVE or FIXES when ops decided the application: an open app checks at once (JS riderAccount), and the notice opens
 * it on the next step.
 */
class RiderMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    when (data["type"]) {
      "OFFER" -> RiderOffers.receive(this, data["offer"] ?: return, "fcm", data["title"], data["body"])
      // A push that arrives after the service came back by itself is stale.
      "GO_ONLINE" -> if (!RiderOnlineService.running) {
        RiderOffers.notice(this, GO_ONLINE_TAG,
          RiderText.fromServer(this, data["title"]) ?: RiderText.get(this, R.string.rider_go_online_title),
          RiderText.fromServer(this, data["body"]) ?: RiderText.get(this, R.string.rider_go_online_body))
      }
      "ACCOUNT" -> {
        RiderEvents.emit(ACCOUNT_EVENT) { Arguments.createMap() }
        val approved = data["decision"] == "APPROVE"
        RiderOffers.notice(this, ACCOUNT_TAG,
          RiderText.fromServer(this, data["title"])
            ?: RiderText.get(this, if (approved) R.string.rider_account_approved_title else R.string.rider_account_fixes_title),
          RiderText.fromServer(this, data["body"])
            ?: RiderText.get(this, if (approved) R.string.rider_account_approved_body else R.string.rider_account_fixes_body))
      }
    }
  }

  override fun onNewToken(token: String) {
    // FirebaseMessaging keeps the token itself, so getFcmToken() returns it even when JS missed this event.
    RiderEvents.emit("riderFcmToken") { Arguments.createMap().apply { putString("token", token) } }
    // On a shift the server must have the new token even if JS isn't running, or offers stop ringing (blueprint A9).
    RiderOnlineService.registerToken(this, token)
  }

  companion object {
    const val GO_ONLINE_TAG = "go-online"
    const val ACCOUNT_TAG = "account"
    const val ACCOUNT_EVENT = "riderAccount"
  }
}
