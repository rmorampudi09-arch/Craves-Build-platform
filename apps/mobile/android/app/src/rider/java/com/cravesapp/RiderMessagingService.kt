package com.cravesapp

import com.facebook.react.bridge.Arguments
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * High-priority, data-only offer pushes from notification-service: data type=OFFER, offerId, offer (Offer JSON),
 * title, body. Every offer posts a visible notification, or FCM deprioritises later pushes.
 */
class RiderMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (data["type"] != "OFFER") return
    val offer = data["offer"] ?: return
    RiderOffers.receive(this, offer, "fcm", data["title"], data["body"])
  }

  override fun onNewToken(token: String) {
    // FirebaseMessaging keeps the token itself, so getFcmToken() returns it even when JS missed this event.
    RiderEvents.emit("riderFcmToken") { Arguments.createMap().apply { putString("token", token) } }
  }
}
