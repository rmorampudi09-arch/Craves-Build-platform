package com.cravesapp

/**
 * The foreground notification while on a trip (docs/riders/REDESIGN.md, R-04): one title with the step and the order
 * code, a one-line body, and three actions: Back to Craves, the step's own action, SOS. Pure, so RiderTripNoticeTest
 * reads it without Android; RiderOnlineService turns the ids into words with RiderText.
 */
object RiderTripNotice {
  /** The JS trip action a tapped step action asks for (contract.ts TripAction); the app posts it on the matching step. */
  data class Content(val title: Int, val titleArgs: List<String>, val body: Int, val action: Int?, val tapStep: String?)

  /** "0BDE0101" reads "0BDE 0101": a space after the 4th character of an 8-character code; other codes stay as they are. */
  fun spaced(orderCode: String): String =
    if (orderCode.length == 8 && orderCode.all { it.isLetterOrDigit() }) orderCode.substring(0, 4) + " " + orderCode.substring(4) else orderCode

  /** Null off a trip: the plain "You're online" notification stays. */
  fun content(step: String, kitchenName: String, customerFirstName: String, orderCode: String, foodReady: Boolean): Content? {
    val code = spaced(orderCode)
    return when (step) {
      "TO_KITCHEN" -> Content(
        R.string.rider_notice_to_kitchen, listOf(kitchenName, code),
        if (foodReady) R.string.rider_notice_food_ready else R.string.rider_notice_ride,
        R.string.rider_notice_reached, "arrived-pickup",
      )
      "AT_KITCHEN" -> Content(R.string.rider_notice_at_kitchen, listOf(kitchenName, code), R.string.rider_notice_pickup, R.string.rider_notice_picked_up, "picked-up")
      "PICKED_UP" -> Content(R.string.rider_notice_to_customer, listOf(customerFirstName, code), R.string.rider_notice_drop, R.string.rider_notice_at_door, "arrived-drop")
      "AT_DROP" -> Content(R.string.rider_notice_to_customer, listOf(customerFirstName, code), R.string.rider_notice_handover, null, null)
      else -> null
    }
  }
}
