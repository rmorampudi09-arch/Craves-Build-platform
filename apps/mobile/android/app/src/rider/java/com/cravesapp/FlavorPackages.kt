package com.cravesapp

import com.facebook.react.ReactPackage

/** Native modules that ship only in the rider app. */
object FlavorPackages {
  fun extra(): List<ReactPackage> = listOf(RiderDevicePackage())
}
