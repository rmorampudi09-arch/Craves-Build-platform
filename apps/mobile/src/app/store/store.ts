import {configureStore} from '@reduxjs/toolkit';
import {authReducer} from '../../features/auth/state/authSlice';
import {cartReducer} from '../../features/cart/state/cartSlice';
import {customerShellReducer} from '../../features/customerShell/state/customerShellSlice';
import {discoveryFilterReducer} from '../../features/discoveryFilters/state/discoveryFilterSlice';
import {discoverySearchReducer} from '../../features/discoverySearch/state/discoverySearchSlice';
import {paymentMethodReducer} from '../../features/payment/state/paymentMethodSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    customerShell: customerShellReducer,
    discoveryFilters: discoveryFilterReducer,
    discoverySearch: discoverySearchReducer,
    paymentMethods: paymentMethodReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({serializableCheck: true, immutableCheck: __DEV__}),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
