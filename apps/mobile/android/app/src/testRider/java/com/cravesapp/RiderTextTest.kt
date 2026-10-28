package com.cravesapp

import org.junit.Assert.assertEquals
import org.junit.Test

/** P2-08: an offer that rings in Telugu or Hindi shows its pay as the server writes it (FleetRiderService.rupees). */
class RiderTextTest {
  @Test
  fun rupeesAsTheServerWritesThem() {
    assertEquals("₹62", RiderText.rupees(6_200))
    assertEquals("₹62.50", RiderText.rupees(6_250))
    assertEquals("₹0.05", RiderText.rupees(5))
    assertEquals("₹1250", RiderText.rupees(125_000))
  }
}
