import {configureStore} from '@reduxjs/toolkit';
import {authReducer} from '../../features/auth/state/authSlice';
import {cartReducer} from '../../features/cart/state/cartSlice';
import {customerShellReducer} from '../../features/customerShell/state/customerShellSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    customerShell: customerShellReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({serializableCheck: true, immutableCheck: __DEV__}),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
