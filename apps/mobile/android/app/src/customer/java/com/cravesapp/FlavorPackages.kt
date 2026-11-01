package com.cravesapp

import com.facebook.react.ReactPackage

/** Native modules that ship only in this flavor. The customer app has none. */
object FlavorPackages {
  fun extra(): List<ReactPackage> = emptyList()
}
