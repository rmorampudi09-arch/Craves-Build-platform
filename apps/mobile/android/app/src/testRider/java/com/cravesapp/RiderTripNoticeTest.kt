package com.cravesapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** App 1.3.3 (R-04): the trip notification's content per step. */
class RiderTripNoticeTest {
  private fun at(step: String, foodReady: Boolean = false) = RiderTripNotice.content(step, "Lakshmi's Kitchen", "Anil", "0BDE0101", foodReady)

  @Test
  fun theOrderCodeReadsInTwoHalves() {
    assertEquals("0BDE 0101", RiderTripNotice.spaced("0BDE0101"))
    assertEquals("CR-4107", RiderTripNotice.spaced("CR-4107"))
    assertEquals("", RiderTripNotice.spaced(""))
  }

  @Test
  fun eachStepHasItsOwnTitleBodyAndAction() {
    val toKitchen = at("TO_KITCHEN")!!
    assertEquals(R.string.rider_notice_to_kitchen, toKitchen.title)
    assertEquals(listOf("Lakshmi's Kitchen", "0BDE 0101"), toKitchen.titleArgs)
    assertEquals(R.string.rider_notice_ride, toKitchen.body)
    assertEquals(R.string.rider_notice_food_ready, at("TO_KITCHEN", foodReady = true)!!.body)
    assertEquals(R.string.rider_notice_reached, toKitchen.action)
    assertEquals("arrived-pickup", toKitchen.tapStep)

    val atKitchen = at("AT_KITCHEN")!!
    assertEquals(R.string.rider_notice_at_kitchen, atKitchen.title)
    assertEquals(R.string.rider_notice_pickup, atKitchen.body)
    assertEquals(R.string.rider_notice_picked_up, atKitchen.action)
    assertEquals("picked-up", atKitchen.tapStep)

    val toCustomer = at("PICKED_UP")!!
    assertEquals(R.string.rider_notice_to_customer, toCustomer.title)
    assertEquals(listOf("Anil", "0BDE 0101"), toCustomer.titleArgs)
    assertEquals(R.string.rider_notice_drop, toCustomer.body)
    assertEquals(R.string.rider_notice_at_door, toCustomer.action)
    assertEquals("arrived-drop", toCustomer.tapStep)

    // At the door the code is typed in the app: no step action, only Back to Craves and SOS.
    val atDoor = at("AT_DROP")!!
    assertEquals(R.string.rider_notice_handover, atDoor.body)
    assertNull(atDoor.action)
    assertNull(atDoor.tapStep)
  }

  @Test
  fun offATripTheOnlineNotificationStays() {
    assertNull(at("DELIVERED"))
    assertNull(at("CANCELLED"))
    assertNull(at(""))
  }
}
