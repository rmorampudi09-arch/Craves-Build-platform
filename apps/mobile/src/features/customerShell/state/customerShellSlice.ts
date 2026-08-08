import {createSlice, type PayloadAction} from '@reduxjs/toolkit';

export interface CustomerBrowsingLocation {
  kind: 'SAVED_ADDRESS';
  addressId: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface CustomerShellState {
  selectedLocation: CustomerBrowsingLocation | null;
}

const initialState: CustomerShellState = {
  selectedLocation: null,
};

const customerShellSlice = createSlice({
  name: 'customerShell',
  initialState,
  reducers: {
    locationSelected(state, action: PayloadAction<CustomerBrowsingLocation>) {
      state.selectedLocation = action.payload;
    },
    locationCleared(state) {
      state.selectedLocation = null;
    },
    resetCustomerShell() {
      return initialState;
    },
  },
});

export const customerShellActions = customerShellSlice.actions;
export const customerShellReducer = customerShellSlice.reducer;
