import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type {CustomerPaymentMethodId} from '../domain/paymentMethodTypes';

export interface PaymentMethodSelectionState {
  selectedPrimaryMethodId: CustomerPaymentMethodId | null;
}

const initialState: PaymentMethodSelectionState = {
  selectedPrimaryMethodId: null,
};

const paymentMethodSlice = createSlice({
  name: 'paymentMethods',
  initialState,
  reducers: {
    selectPrimaryPaymentMethod(
      state,
      action: PayloadAction<CustomerPaymentMethodId>,
    ) {
      state.selectedPrimaryMethodId = action.payload;
    },
    clearPrimaryPaymentMethod(state) {
      state.selectedPrimaryMethodId = null;
    },
  },
});

export const {selectPrimaryPaymentMethod, clearPrimaryPaymentMethod} =
  paymentMethodSlice.actions;
export const paymentMethodReducer = paymentMethodSlice.reducer;
