import {configureStore} from '@reduxjs/toolkit';
import {authReducer} from '../../features/auth/state/authSlice';
import {customerShellReducer} from '../../features/customerShell/state/customerShellSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    customerShell: customerShellReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({serializableCheck: true, immutableCheck: __DEV__}),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
