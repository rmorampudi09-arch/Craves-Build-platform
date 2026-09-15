import {captureException} from './observability';

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;

interface ReactNativeErrorUtils {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}

type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: ReactNativeErrorUtils;
};

let installed = false;

export function installGlobalErrorObservation(): void {
  if (installed) {
    return;
  }

  const errorUtils = (globalThis as GlobalWithErrorUtils).ErrorUtils;
  if (!errorUtils) {
    return;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    captureException(error, 'unhandled_js_exception', {fatal: Boolean(isFatal)});
    previousHandler(error, isFatal);
  });
  installed = true;
}
