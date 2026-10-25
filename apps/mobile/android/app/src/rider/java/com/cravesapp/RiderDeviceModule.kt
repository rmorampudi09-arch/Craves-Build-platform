package com.cravesapp

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.location.LocationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Phone checks for the rider setup screen. Android can't report autostart, so the app asks the rider. */
class RiderDeviceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CravesRiderDevice"

  @ReactMethod
  fun getDeviceState(promise: Promise) {
    try {
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      val location = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val state = Arguments.createMap()
      state.putBoolean("ignoringBatteryOptimizations", power.isIgnoringBatteryOptimizations(reactContext.packageName))
      state.putBoolean("powerSaveMode", power.isPowerSaveMode)
      state.putBoolean("locationEnabled", LocationManagerCompat.isLocationEnabled(location))
      state.putBoolean("notificationsEnabled", NotificationManagerCompat.from(reactContext).areNotificationsEnabled())
      state.putString("manufacturer", Build.MANUFACTURER.lowercase())
      promise.resolve(state)
    } catch (error: Exception) {
      promise.reject("RIDER_DEVICE_STATE", error)
    }
  }

  /** Opens the system list; Play restricts the direct "ignore optimisations" dialog. */
  @ReactMethod
  fun openBatterySettings(promise: Promise) {
    promise.resolve(start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) || openAppDetails())
  }

  /** Resolves true when a vendor autostart screen opened, false when it fell back to app details. */
  @ReactMethod
  fun openAutostartSettings(promise: Promise) {
    val opened = AUTOSTART_SCREENS.any { (pkg, cls) ->
      start(Intent().setComponent(ComponentName(pkg, cls)))
    }
    if (!opened) openAppDetails()
    promise.resolve(opened)
  }

  @ReactMethod
  fun openAppSettings(promise: Promise) {
    promise.resolve(openAppDetails())
  }

  /**
   * The id the server binds the rider to (X-Craves-Installation-Id). ANDROID_ID is per signing key, user and phone:
   * it survives a reinstall but changes after a factory reset or with a new signing key. Null if the phone has none.
   */
  @SuppressLint("HardwareIds") // Binding one rider to one phone is the purpose here.
  @ReactMethod
  fun getInstallationId(promise: Promise) {
    promise.resolve(Settings.Secure.getString(reactContext.contentResolver, Settings.Secure.ANDROID_ID))
  }

  private fun openAppDetails(): Boolean =
    start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", reactContext.packageName, null)))

  private fun start(intent: Intent): Boolean =
    try {
      reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (error: Exception) {
      // ActivityNotFoundException or SecurityException: this phone doesn't have that screen.
      false
    }

  companion object {
    // Xiaomi, Oppo/Realme (ColorOS and the newer OPlus package) and Vivo/iQOO, per dontkillmyapp.com.
    private val AUTOSTART_SCREENS = listOf(
      "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
      "com.oplus.safecenter" to "com.oplus.safecenter.permission.startup.StartupAppListActivity",
      "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
      "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
    )
  }
}
