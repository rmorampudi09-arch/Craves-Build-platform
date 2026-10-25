# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# R8 runs only for the rider CI build (-PcravesRiderMinify=true in .github/workflows/rider-apk.yml). Most libraries
# ship their own rules (react-android, Hermes, Firebase, Play services, OkHttp, Expo, Reanimated, SVG); these repeat
# the ones the rider app can't work without, so a library update that drops them can't break it silently.
# If a CI build fails with "Missing class", R8 writes the rule it wants to
# android/app/build/outputs/mapping/riderRelease/missing_rules.txt: copy it here after checking it.

# react-native-config reads every .env value from BuildConfig by reflection (CRAVES_RIDER_API_MODE, the API URL).
-keep class com.cravesapp.BuildConfig { *; }

# React Native and Hermes: JNI and @DoNotStrip classes, and native modules found by reflection.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# Rider native modules (CravesRiderDevice, CravesRiderOnline): JS calls their @ReactMethod methods by name.
-keep class com.cravesapp.RiderDeviceModule { *; }
-keep class com.cravesapp.RiderOnlineModule { *; }

# OkHttp and Okio (the rider service's /locations uploads): optional TLS providers are not in the app.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn okio.**

# Firebase Messaging (offer pushes) finds its components by reflection.
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
-keep class com.google.firebase.messaging.** { *; }
-dontwarn com.google.firebase.**

# Play services location (the online service's fused location).
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.**

# Razorpay is linked into every flavor; its README asks for these rules. The rider app never opens it.
-keepattributes *Annotation*
-dontwarn com.razorpay.**
-keep class com.razorpay.** { *; }
-keepclasseswithmembers class * {
    public void onPayment*(...);
}
