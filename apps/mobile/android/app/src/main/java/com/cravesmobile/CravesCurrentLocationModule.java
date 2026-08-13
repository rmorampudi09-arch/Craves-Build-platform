package com.cravesapp;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

public final class CravesCurrentLocationModule extends ReactContextBaseJavaModule {
    private static final long RECENT_LOCATION_MAX_AGE_MS = 30_000L;
    private static final long LOCATION_TIMEOUT_MS = 12_000L;

    private final ReactApplicationContext reactContext;

    CravesCurrentLocationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "CravesCurrentLocation";
    }

    @ReactMethod
    public void getCurrentLocation(Promise promise) {
        boolean fineGranted = reactContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = reactContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fineGranted && !coarseGranted) {
            promise.reject("LOCATION_PERMISSION_REQUIRED", "Foreground location permission is required.");
            return;
        }

        LocationManager manager = (LocationManager) reactContext.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            promise.reject("LOCATION_UNAVAILABLE", "Location services are unavailable on this device.");
            return;
        }

        Location bestKnown = bestLastKnownLocation(manager);
        if (bestKnown != null && System.currentTimeMillis() - bestKnown.getTime() <= RECENT_LOCATION_MAX_AGE_MS) {
            promise.resolve(toMap(bestKnown));
            return;
        }

        String provider = chooseProvider(manager, fineGranted);
        if (provider == null) {
            if (bestKnown != null) {
                promise.resolve(toMap(bestKnown));
            } else {
                promise.reject("LOCATION_PROVIDER_DISABLED", "Turn on device location services and try again.");
            }
            return;
        }

        AtomicBoolean finished = new AtomicBoolean(false);
        Handler handler = new Handler(Looper.getMainLooper());
        final Location[] fallback = new Location[] {bestKnown};

        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (!finished.compareAndSet(false, true)) {
                    return;
                }
                handler.removeCallbacksAndMessages(this);
                manager.removeUpdates(this);
                promise.resolve(toMap(location));
            }

            @Override
            public void onProviderDisabled(String disabledProvider) {
                // The timeout handles provider changes without resolving twice.
            }

            @Override
            public void onProviderEnabled(String enabledProvider) {
                // No-op.
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onStatusChanged(String changedProvider, int status, Bundle extras) {
                // No-op for legacy Android callback compatibility.
            }
        };

        Runnable timeout = () -> {
            if (!finished.compareAndSet(false, true)) {
                return;
            }
            manager.removeUpdates(listener);
            if (fallback[0] != null) {
                promise.resolve(toMap(fallback[0]));
            } else {
                promise.reject("LOCATION_TIMEOUT", "Current location could not be determined. Try again.");
            }
        };

        try {
            manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
            handler.postDelayed(timeout, LOCATION_TIMEOUT_MS);
        } catch (SecurityException error) {
            finished.set(true);
            promise.reject("LOCATION_PERMISSION_REQUIRED", "Foreground location permission is required.", error);
        } catch (RuntimeException error) {
            finished.set(true);
            promise.reject("LOCATION_UNAVAILABLE", "Current location could not be determined.", error);
        }
    }

    private static String chooseProvider(LocationManager manager, boolean fineGranted) {
        if (fineGranted && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            return LocationManager.GPS_PROVIDER;
        }
        if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            return LocationManager.NETWORK_PROVIDER;
        }
        if (manager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
            return LocationManager.PASSIVE_PROVIDER;
        }
        return null;
    }

    private static Location bestLastKnownLocation(LocationManager manager) {
        Location best = null;
        List<String> providers = manager.getProviders(true);
        for (String provider : providers) {
            try {
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate == null) {
                    continue;
                }
                if (best == null || candidate.getTime() > best.getTime()) {
                    best = candidate;
                }
            } catch (SecurityException ignored) {
                return best;
            }
        }
        return best;
    }

    private static WritableMap toMap(Location location) {
        WritableMap result = Arguments.createMap();
        result.putDouble("latitude", location.getLatitude());
        result.putDouble("longitude", location.getLongitude());
        if (location.hasAccuracy()) {
            result.putDouble("accuracy", location.getAccuracy());
        } else {
            result.putNull("accuracy");
        }
        return result;
    }
}
