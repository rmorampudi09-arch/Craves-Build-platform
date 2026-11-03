package com.cravesapp

import android.graphics.Color
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.GoogleMapOptions
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CircleOptions
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MarkerOptions

/**
 * The offer's map preview (docs/riders/REDESIGN.md, R-02): Google Maps in lite mode (a still image, no gestures, no
 * tiles streamed), with the kitchen as a pin, the rider as a dot and the customer's AREA as a shaded 300 m circle on its
 * centre. Never a pin on the door: the address stays unknown until the offer is accepted. The view exists only in the
 * rider flavor and the app draws it only when the build has a Maps key (BuildConfig.RIDER_MAPS_KEY, rider-apk.yml).
 */
class RiderOfferMapManager : SimpleViewManager<RiderOfferMapView>() {
  override fun getName(): String = "CravesRiderOfferMap"

  override fun createViewInstance(context: ThemedReactContext): RiderOfferMapView = RiderOfferMapView(context)

  @ReactProp(name = "kitchen")
  fun setKitchen(view: RiderOfferMapView, point: ReadableMap?) {
    view.kitchen = point?.latLng()
    view.draw()
  }

  @ReactProp(name = "customerArea")
  fun setCustomerArea(view: RiderOfferMapView, point: ReadableMap?) {
    view.customerArea = point?.latLng()
    view.draw()
  }

  override fun onDropViewInstance(view: RiderOfferMapView) {
    super.onDropViewInstance(view)
    view.onDestroy()
  }
}

private fun ReadableMap.latLng(): LatLng? =
  if (hasKey("lat") && hasKey("lng")) LatLng(getDouble("lat"), getDouble("lng")) else null

class RiderOfferMapView(context: ThemedReactContext) : MapView(context, GoogleMapOptions().liteMode(true)) {
  var kitchen: LatLng? = null
  var customerArea: LatLng? = null
  private var map: GoogleMap? = null

  init {
    // Lite mode is a still image: onCreate is the only lifecycle call it needs; onDestroy comes from onDropViewInstance.
    onCreate(null)
    getMapAsync { ready ->
      ready.uiSettings.isMapToolbarEnabled = false
      map = ready
      draw()
    }
  }

  // React Native lays a native view out once; a child's later requestLayout is dropped, so lay out by hand (the usual fix).
  override fun requestLayout() {
    super.requestLayout()
    post {
      measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
      layout(left, top, right, bottom)
    }
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    draw()
  }

  fun draw() {
    val map = map ?: return
    val kitchen = kitchen ?: return
    if (width == 0 || height == 0) return
    map.clear()
    val bounds = LatLngBounds.builder().include(kitchen)
    map.addMarker(MarkerOptions().position(kitchen).icon(BitmapDescriptorFactory.defaultMarker(FLAME_HUE)))
    customerArea?.let { area ->
      map.addCircle(CircleOptions().center(area).radius(AREA_RADIUS_M).fillColor(AREA_FILL).strokeColor(AREA_STROKE).strokeWidth(2f))
      bounds.include(area)
    }
    // The rider's own spot is the online service's last fix: no second location listener, no new permission.
    RiderOnlineService.lastFix?.let { fix ->
      val you = LatLng(fix.lat, fix.lng)
      map.addCircle(CircleOptions().center(you).radius(YOU_RADIUS_M).fillColor(INK).strokeColor(Color.WHITE).strokeWidth(4f))
      bounds.include(you)
    }
    // shortcut: the bounds hold the circle's centre, not its rim, and the padding covers a 300 m ring down to about zoom 13;
    // upgrade to rim points if an area ever sits at the edge of a very long trip.
    map.moveCamera(
      if (customerArea == null && RiderOnlineService.lastFix == null) CameraUpdateFactory.newLatLngZoom(kitchen, 15f)
      else CameraUpdateFactory.newLatLngBounds(bounds.build(), width, height, PADDING_PX),
    )
  }

  private companion object {
    /** The design's flame red (#F62E18) as a marker hue, and its 14 % tint and deep-red rim for the area. */
    const val FLAME_HUE = 6f
    val AREA_FILL = Color.argb(36, 0xF6, 0x2E, 0x18)
    val AREA_STROKE = Color.rgb(0xC8, 0x21, 0x0F)
    val INK = Color.rgb(0x26, 0x1A, 0x15)
    const val AREA_RADIUS_M = 300.0
    const val YOU_RADIUS_M = 25.0
    const val PADDING_PX = 120
  }
}
