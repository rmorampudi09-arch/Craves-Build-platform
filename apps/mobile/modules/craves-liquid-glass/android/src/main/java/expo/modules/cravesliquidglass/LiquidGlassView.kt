package expo.modules.cravesliquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import eightbitlab.com.blurview.BlurTarget
import eightbitlab.com.blurview.recordedNode
import expo.modules.blur.ExpoBlurTargetView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Draws an expo-blur target's recorded backdrop through the liquid glass shader.
 * The backdrop node is shared, so its redraws reach the glass without re-recording.
 */
@SuppressLint("ViewConstructor")
class LiquidGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var refraction = 0.5f
  var blurRadius = 1f
  var bezel = 0.22f
  var thickness = 1.5f
  var cornerRadius = 999f
  var aberration = 2f
  var saturation = 1.4f
  var specular = 0.45f
  var edgeGlow = 0.5f
  private var tint = floatArrayOf(1f, 1f, 1f, 0.05f)

  private val density = resources.displayMetrics.density
  private val glass = if (Build.VERSION.SDK_INT >= 33) Glass() else null
  private var targetId: Int? = null
  private var target: BlurTarget? = null
  private val targetLocation = IntArray(2)
  private val selfLocation = IntArray(2)
  private var offsetX = 0
  private var offsetY = 0

  // Only a change in where the glass sits over its backdrop needs a new recording.
  private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
    if (updateOffset()) invalidate()
    true
  }

  init {
    setWillNotDraw(false)
  }

  fun setTargetId(id: Int?) {
    if (id == targetId) return
    targetId = id
    target = id?.let { appContext.findView<ExpoBlurTargetView>(it) }?.let(::blurTargetOf)
    updateOffset()
    invalidate()
  }

  fun setTint(values: List<Float>) {
    if (values.size == 4) tint = values.toFloatArray()
  }

  fun applyProps() {
    glass?.dirty = true
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(preDrawListener)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDrawListener)
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    glass?.dirty = true
  }

  override fun draw(canvas: Canvas) {
    super.draw(canvas)
    val backdrop = target?.recordedNode() ?: return
    if (glass == null || !canvas.isHardwareAccelerated || width == 0 || height == 0) return
    updateOffset()
    glass.draw(canvas, backdrop)
  }

  private fun updateOffset(): Boolean {
    val backdrop = target ?: return false
    backdrop.getLocationInWindow(targetLocation)
    getLocationInWindow(selfLocation)
    val x = targetLocation[0] - selfLocation[0]
    val y = targetLocation[1] - selfLocation[1]
    if (x == offsetX && y == offsetY) return false
    offsetX = x
    offsetY = y
    return true
  }

  @RequiresApi(33)
  private inner class Glass {
    private val node = RenderNode("CravesLiquidGlass")
    private val shader = RuntimeShader(LIQUID_GLASS_SHADER)
    var dirty = true

    fun draw(canvas: Canvas, backdrop: RenderNode) {
      node.setPosition(0, 0, width, height)
      if (dirty) {
        applyEffect()
        dirty = false
      }
      val recording = node.beginRecording()
      recording.translate(offsetX.toFloat(), offsetY.toFloat())
      recording.drawRenderNode(backdrop)
      node.endRecording()
      canvas.drawRenderNode(node)
    }

    private fun applyEffect() {
      shader.setFloatUniform("size", width.toFloat(), height.toFloat())
      shader.setFloatUniform("cornerRadius", cornerRadius * density)
      shader.setFloatUniform("bezel", bezel)
      shader.setFloatUniform("thickness", thickness)
      shader.setFloatUniform("refraction", refraction)
      shader.setFloatUniform("aberration", aberration)
      shader.setFloatUniform("saturation", saturation)
      shader.setFloatUniform("tint", tint[0], tint[1], tint[2], tint[3])
      shader.setFloatUniform("specular", specular)
      shader.setFloatUniform("edgeGlow", edgeGlow)
      val lens = RenderEffect.createRuntimeShaderEffect(shader, "content")
      val radius = blurRadius * density
      node.setRenderEffect(
        if (radius > 0f) {
          RenderEffect.createChainEffect(lens, RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP))
        } else {
          lens
        },
      )
    }
  }

  private companion object {
    // expo-blur keeps its BlurTarget in an internal property, which another module can't name.
    fun blurTargetOf(view: ExpoBlurTargetView): BlurTarget? =
      ExpoBlurTargetView::class.java.declaredFields
        .firstOrNull { BlurTarget::class.java.isAssignableFrom(it.type) }
        ?.apply { isAccessible = true }
        ?.get(view) as? BlurTarget
        ?: view.getChildAt(0)?.parent as? BlurTarget
  }
}
