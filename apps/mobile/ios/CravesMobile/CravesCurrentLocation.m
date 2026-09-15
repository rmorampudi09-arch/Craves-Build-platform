#import <CoreLocation/CoreLocation.h>
#import <React/RCTBridgeModule.h>

@interface CravesCurrentLocation : NSObject <RCTBridgeModule, CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *manager;
@property(nonatomic, copy) RCTPromiseResolveBlock permissionResolve;
@property(nonatomic, copy) RCTPromiseResolveBlock locationResolve;
@property(nonatomic, copy) RCTPromiseRejectBlock locationReject;
@end

@implementation CravesCurrentLocation
RCT_EXPORT_MODULE(CravesCurrentLocation)
+ (BOOL)requiresMainQueueSetup { return YES; }

- (CLLocationManager *)locationManager {
  if (_manager == nil) {
    _manager = [CLLocationManager new];
    _manager.delegate = self;
    _manager.desiredAccuracy = kCLLocationAccuracyBest;
  }
  return _manager;
}

- (NSString *)currentPermissionStatus {
  CLAuthorizationStatus status;
  if (@available(iOS 14.0, *)) status = self.locationManager.authorizationStatus;
  else status = [CLLocationManager authorizationStatus];
  if (status == kCLAuthorizationStatusAuthorizedAlways || status == kCLAuthorizationStatusAuthorizedWhenInUse) return @"granted";
  if (status == kCLAuthorizationStatusNotDetermined) return @"undetermined";
  return @"denied";
}

RCT_REMAP_METHOD(getPermissionStatus, getPermissionStatusWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve([self currentPermissionStatus]);
  });
}

RCT_REMAP_METHOD(requestPermission, requestPermissionWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *status = [self currentPermissionStatus];
    if (![status isEqualToString:@"undetermined"]) { resolve(status); return; }
    if (self.permissionResolve != nil) { reject(@"LOCATION_PERMISSION_BUSY", @"A location permission request is already active.", nil); return; }
    self.permissionResolve = resolve;
    [self.locationManager requestWhenInUseAuthorization];
  });
}

RCT_REMAP_METHOD(getCurrentLocation, getCurrentLocationWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![[self currentPermissionStatus] isEqualToString:@"granted"]) { reject(@"LOCATION_PERMISSION_REQUIRED", @"Foreground location permission is required.", nil); return; }
    if (self.locationResolve != nil) { reject(@"LOCATION_REQUEST_BUSY", @"A current-location request is already active.", nil); return; }
    self.locationResolve = resolve;
    self.locationReject = reject;
    [self.locationManager requestLocation];
  });
}

- (void)finishPermissionIfNeeded {
  if (self.permissionResolve == nil) return;
  NSString *status = [self currentPermissionStatus];
  if ([status isEqualToString:@"undetermined"]) return;
  RCTPromiseResolveBlock resolve = self.permissionResolve;
  self.permissionResolve = nil;
  resolve(status);
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager { [self finishPermissionIfNeeded]; }
- (void)locationManager:(CLLocationManager *)manager didChangeAuthorizationStatus:(CLAuthorizationStatus)status { [self finishPermissionIfNeeded]; }

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
  CLLocation *location = locations.lastObject;
  if (location == nil || self.locationResolve == nil) return;
  RCTPromiseResolveBlock resolve = self.locationResolve;
  self.locationResolve = nil;
  self.locationReject = nil;
  resolve(@{@"latitude": @(location.coordinate.latitude), @"longitude": @(location.coordinate.longitude), @"accuracy": @(location.horizontalAccuracy)});
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
  if (self.locationReject == nil) return;
  RCTPromiseRejectBlock reject = self.locationReject;
  self.locationResolve = nil;
  self.locationReject = nil;
  reject(@"LOCATION_UNAVAILABLE", @"Current location could not be determined.", error);
}
@end
