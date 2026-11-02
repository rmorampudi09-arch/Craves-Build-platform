package com.cravesapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The sign-in code taken from the SMS the rider let the app read: only six digits standing alone. */
class RiderSmsCodeTest {
  @Test
  fun takesTheSixDigitCodeFromTheMessage() {
    assertEquals("482615", RiderSmsCode.codeIn("482615 is your Craves verification code. It expires in 15 minutes."))
    assertEquals("482615", RiderSmsCode.codeIn("Your Craves code is 482615."))
    assertEquals("004213", RiderSmsCode.codeIn("Code: 004213"))
  }

  @Test
  fun takesTheCodeNotTheAppHashFromTheRiderTemplate() {
    // The SMS Retriever's message: the code first, the app hash (which may hold digits) last.
    assertEquals("482615", RiderSmsCode.codeIn("482615 is your Craves Rider code. Valid 10 minutes.\n123456/9VSu"))
    assertEquals("482615", RiderSmsCode.codeIn("<#> 482615 is your Craves Rider code.\nFA+9qCX9VSu"))
  }

  @Test
  fun neverTakesPartOfALongerNumber() {
    assertNull(RiderSmsCode.codeIn("Call 9848012345 for help"))
    assertEquals("482615", RiderSmsCode.codeIn("Order 12345678: your code is 482615"))
    assertNull(RiderSmsCode.codeIn("No code here"))
    assertNull(RiderSmsCode.codeIn(null))
  }
}
