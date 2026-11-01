package com.cravesapp

import android.content.Intent
import com.facebook.react.ReactPackage

/** Native modules that ship only in the rider app, and the launch that may show over the lock screen. */
object FlavorPackages {
  fun extra(): List<ReactPackage> = listOf(RiderDevicePackage(), RiderOnlinePackage())

  /** A ringing offer's full-screen alert (RiderOffers.ringing); MainActivity shows it over the lock screen. */
  fun showsOverLockScreen(intent: Intent?): Boolean = RiderOffers.ringing(intent)
}
