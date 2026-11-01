package com.cravesapp

import android.content.Intent
import com.facebook.react.ReactPackage

/** Native modules that ship only in this flavor. The customer app has none, and never shows over the lock screen. */
object FlavorPackages {
  fun extra(): List<ReactPackage> = emptyList()

  @Suppress("UNUSED_PARAMETER")
  fun showsOverLockScreen(intent: Intent?): Boolean = false
}
