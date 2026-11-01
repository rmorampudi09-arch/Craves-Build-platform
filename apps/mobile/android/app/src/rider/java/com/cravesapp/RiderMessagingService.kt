package com.cravesapp

import com.facebook.react.bridge.Arguments
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * High-priority, data-only pushes from notification-service, each posting a visible notification (or FCM deprioritises
 * later pushes): type=OFFER with offerId, offer (Offer JSON), title, body; type=GO_ONLINE (P1-13) when the shift is open
 * but the phone stopped calling, whose tap opens the app so Home resumes the shift; type=ACCOUNT (P6-04) with decision
 * APPROVE or FIXES when ops decided the application: an open app checks at once (JS riderAccount), and the notice opens
 * it on the next step; type=TRIP_ENDED (app 1.3.0) with tripId and reason CANCELLED, RELEASED, HANDED_TO_RIDER or
 * ORDER_CANCELLED when the rider's trip ended without them: an open app reads its trip again (JS riderTripEnded), and the
 * notice says why and that the trip so far is paid.
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
      "TRIP_ENDED" -> {
        val tripId = data["tripId"].orEmpty()
        RiderEvents.emit(TRIP_ENDED_EVENT) { Arguments.createMap().apply { putString("tripId", tripId) } }
        // Marks it told, so /locations seeing the trip end later doesn't replace these words with its plainer ones.
        RiderOffers.firstEnd(tripId)
        val why = when (data["reason"]) {
          "RELEASED" -> R.string.rider_trip_ended_released
          "HANDED_TO_RIDER" -> R.string.rider_trip_ended_handed
          "ORDER_CANCELLED" -> R.string.rider_trip_ended_order_cancelled
          else -> R.string.rider_trip_ended_cancelled
        }
        RiderOffers.notice(this, RiderOffers.TRIP_ENDED_TAG,
          RiderText.fromServer(this, data["title"]) ?: RiderText.get(this, R.string.rider_trip_ended_title),
          RiderText.fromServer(this, data["body"]) ?: RiderText.get(this, why))
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
    const val TRIP_ENDED_EVENT = "riderTripEnded"
  }
}
