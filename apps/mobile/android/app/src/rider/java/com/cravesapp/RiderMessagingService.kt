package com.cravesapp

import com.facebook.react.bridge.Arguments
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * High-priority, data-only pushes from notification-service, each posting a visible notification (or FCM deprioritises
 * later pushes): type=OFFER with offerId, offer (Offer JSON), title, body; type=GO_ONLINE (P1-13) when the shift is open
 * but the phone stopped calling, whose tap opens the app so Home resumes the shift.
 */
class RiderMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    when (data["type"]) {
      "OFFER" -> RiderOffers.receive(this, data["offer"] ?: return, "fcm", data["title"], data["body"])
      // A push that arrives after the service came back by itself is stale.
      "GO_ONLINE" -> if (!RiderOnlineService.running) {
        RiderOffers.notice(this, GO_ONLINE_TAG, data["title"] ?: GO_ONLINE_TITLE, data["body"] ?: GO_ONLINE_BODY)
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
    // shortcut: English only, like the offer texts; move to strings.xml with te/hi (P2-08).
    private const val GO_ONLINE_TITLE = "You're offline"
    private const val GO_ONLINE_BODY = "Tap to go back online and get orders."
  }
}
