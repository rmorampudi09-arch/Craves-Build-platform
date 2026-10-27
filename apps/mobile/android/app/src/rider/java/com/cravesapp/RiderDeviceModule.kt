package com.cravesapp

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.location.LocationManager
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.location.LocationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

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
      // Offers must be able to ring: notifications on and the offers channel still high (blueprint A9).
      state.putBoolean("notificationsEnabled", RiderOffers.canRing(reactContext))
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

  /**
   * Keeps the delivery photo in the app's own files until the server has it (blueprint A2): upright (the camera's EXIF
   * rotation applied), the long edge at most 1600 px, JPEG quality 80, in filesDir/rider-photos. Resolves its file:// URI.
   * On its own thread: decoding a 12 MP photo takes a moment on a cheap phone.
   */
  @ReactMethod
  fun keepPhoto(uri: String, promise: Promise) {
    Thread {
      try {
        promise.resolve(Uri.fromFile(keep(Uri.parse(uri))).toString())
      } catch (error: Exception) {
        promise.reject("RIDER_PHOTO_KEEP", error)
      } catch (error: OutOfMemoryError) {
        promise.reject("RIDER_PHOTO_KEEP", error)
      }
    }.start()
  }

  /** Deletes a photo keepPhoto made, once its delivery was sent or refused. Any other file is left alone. */
  @ReactMethod
  fun deletePhoto(uri: String, promise: Promise) {
    try {
      val file = File(Uri.parse(uri).path ?: "").canonicalFile
      promise.resolve(file.parentFile == File(reactContext.filesDir, PHOTO_DIR).canonicalFile && file.delete())
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  // shortcut: a photo kept just before the app died, never queued, stays in rider-photos; sweep old files if that shows up.
  private fun keep(source: Uri): File {
    val resolver = reactContext.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(source).use { BitmapFactory.decodeStream(it, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "not an image: $source" }
    // The largest power-of-two step down that keeps the long edge at 1600 px or more; the matrix scales the rest.
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_PHOTO_EDGE) sample *= 2
    val decoded = resolver.openInputStream(source).use {
      BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: error("unreadable image: $source")
    val degrees = resolver.openInputStream(source).use { input ->
      when (ExifInterface(input ?: error("unreadable image: $source"))
        .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
    }
    val scale = minOf(1f, MAX_PHOTO_EDGE.toFloat() / maxOf(decoded.width, decoded.height))
    val matrix = Matrix().apply {
      postScale(scale, scale)
      postRotate(degrees)
    }
    val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    val file = File(File(reactContext.filesDir, PHOTO_DIR).apply { mkdirs() }, "${UUID.randomUUID()}.jpg")
    FileOutputStream(file).use { upright.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
    if (upright !== decoded) upright.recycle()
    decoded.recycle()
    return file
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
    private const val PHOTO_DIR = "rider-photos"
    private const val MAX_PHOTO_EDGE = 1600
    private const val JPEG_QUALITY = 80

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
