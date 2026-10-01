// The vendor ships TS sources rather than declarations. Keep its untyped JSON
// outside the app's type boundary; msg91Auth validates every response at runtime.
export declare class OTPWidget {
  static initializeWidget(widgetId: string, tokenAuth: string): Promise<void>;
  static getWidgetProcess(): Promise<unknown>;
  static sendOTP(body: { identifier: string }): Promise<unknown>;
  static verifyOTP(body: { reqId: string; otp: string }): Promise<unknown>;
  static retryOTP(body: { reqId: string }): Promise<unknown>;
}
