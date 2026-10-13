package expo.modules.cravesliquidglass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CravesLiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CravesLiquidGlass")

    View(LiquidGlassView::class) {
      Name("CravesLiquidGlassView")

      Prop("targetId") { view: LiquidGlassView, targetId: Int? -> view.setTargetId(targetId) }
      Prop("refraction") { view: LiquidGlassView, value: Float -> view.refraction = value }
      Prop("blurRadius") { view: LiquidGlassView, value: Float -> view.blurRadius = value }
      Prop("bezel") { view: LiquidGlassView, value: Float -> view.bezel = value }
      Prop("thickness") { view: LiquidGlassView, value: Float -> view.thickness = value }
      Prop("cornerRadius") { view: LiquidGlassView, value: Float -> view.cornerRadius = value }
      Prop("aberration") { view: LiquidGlassView, value: Float -> view.aberration = value }
      Prop("saturation") { view: LiquidGlassView, value: Float -> view.saturation = value }
      Prop("specular") { view: LiquidGlassView, value: Float -> view.specular = value }
      Prop("edgeGlow") { view: LiquidGlassView, value: Float -> view.edgeGlow = value }
      Prop("tint") { view: LiquidGlassView, tint: List<Float> -> view.setTint(tint) }

      OnViewDidUpdateProps { view: LiquidGlassView -> view.applyProps() }
    }
  }
}
