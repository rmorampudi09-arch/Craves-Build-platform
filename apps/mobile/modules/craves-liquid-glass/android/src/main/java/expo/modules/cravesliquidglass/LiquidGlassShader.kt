package expo.modules.cravesliquidglass

/**
 * AGSL lens for a rounded glass slab with a convex-squircle bezel, after kube.io's
 * "Liquid Glass in the browser": height = (1 - (1 - x)^4)^(1/4) across the bezel, and
 * a straight-down ray refracts by Snell's law (air 1.0 to glass 1.5) and lands
 * height * tan(incident - refracted) further in. The flat centre stays undistorted.
 */
internal const val LIQUID_GLASS_SHADER = """
uniform shader content;
uniform float2 size;
uniform float cornerRadius;
uniform float bezel;
uniform float thickness;
uniform float refraction;
uniform float aberration;
uniform float saturation;
uniform float4 tint;
uniform float specular;
uniform float edgeGlow;

const float IOR = 1.5;
// refraction is a 0-1 level; 1 bends twice as far as physical glass, like Apple's thick lenses.
const float MAX_REFRACTION = 2.0;

float roundedBox(float2 p, float2 halfSize, float r) {
  float2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float surface(float x) {
  return pow(1.0 - pow(1.0 - x, 4.0), 0.25);
}

float surfaceSlope(float x) {
  float k = 1.0 - x;
  return k * k * k / pow(max(1.0 - k * k * k * k, 0.0001), 0.75);
}

half4 main(float2 coord) {
  float2 halfSize = size * 0.5;
  float r = min(cornerRadius, min(halfSize.x, halfSize.y));
  float2 p = coord - halfSize;
  float d = roundedBox(p, halfSize, r);
  float inset = max(-d, 0.0);

  float2 n = float2(
    roundedBox(p + float2(0.5, 0.0), halfSize, r) - roundedBox(p - float2(0.5, 0.0), halfSize, r),
    roundedBox(p + float2(0.0, 0.5), halfSize, r) - roundedBox(p - float2(0.0, 0.5), halfSize, r));
  n = n / max(length(n), 0.0001);

  float bezelPx = max(bezel * min(size.x, size.y), 1.0);
  float x = clamp(inset / bezelPx, 0.001, 1.0);
  float incident = atan(thickness * surfaceSlope(x));
  float refracted = asin(sin(incident) / IOR);
  float shift = thickness * bezelPx * surface(x) * tan(incident - refracted) * refraction * MAX_REFRACTION;
  float2 offset = -n * shift;

  float2 uv = coord + offset;
  float split = 0.04 * aberration;
  half4 base = content.eval(uv);
  half3 color = half3(content.eval(uv - offset * split).r, base.g, content.eval(uv + offset * split).b);

  half luma = dot(color, half3(0.2126, 0.7152, 0.0722));
  color = mix(half3(luma), color, half(saturation));
  color = mix(color, half3(tint.rgb), half(tint.a));

  float facing = abs(dot(n, float2(-0.5, -0.866)));

  // Steep bezel faces reflect more (Schlick Fresnel, glass F0 = 0.04) and the curve gathers
  // light, so the ends glow and the flat centre stays clear.
  float fresnel = 0.04 + 0.96 * pow(1.0 - cos(incident), 5.0);
  float gathered = (1.0 - x) * (1.0 - x) * (0.25 + 0.5 * facing);
  color = mix(color, half3(1.0), half(clamp(edgeGlow * (1.2 * fresnel + gathered), 0.0, 0.85)));

  // Rim light from the upper left, reflected on the opposite edge too.
  float rimLine = 1.0 - smoothstep(0.0, 2.0, inset);
  float rimGlow = pow(1.0 - x, 3.0);
  color += half3(specular * (rimLine * (0.35 + 0.65 * facing) + rimGlow * facing * facing * 0.35));

  float alpha = clamp(0.5 - d, 0.0, 1.0);
  return half4(clamp(color, 0.0, 1.0) * half(alpha), half(alpha));
}
"""
