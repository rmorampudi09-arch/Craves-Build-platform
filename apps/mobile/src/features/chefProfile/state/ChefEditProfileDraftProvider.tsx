import React from 'react';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {
  chefKitchenProfileToFormValues,
  mergeChefEditProfileAddressSelection,
  type ChefEditProfileAddressSelection,
  type ChefEditProfileFormValues,
} from '../domain/chefEditProfileForm';

export interface ChefEditProfileDraftState {
  originalProfile: ChefKitchenProfile | null;
  formDraft: ChefEditProfileFormValues | null;
  dirtyState: boolean;
}

type ChefEditProfileDraftAction =
  | {type: 'BEGIN'; profile: ChefKitchenProfile}
  | {type: 'REPLACE_DRAFT'; values: ChefEditProfileFormValues}
  | {type: 'APPLY_ADDRESS'; selection: ChefEditProfileAddressSelection}
  | {type: 'COMMIT'; profile: ChefKitchenProfile}
  | {type: 'DISCARD'};

const EMPTY_STATE: ChefEditProfileDraftState = {
  originalProfile: null,
  formDraft: null,
  dirtyState: false,
};

function formValuesEqual(
  left: ChefEditProfileFormValues,
  right: ChefEditProfileFormValues,
): boolean {
  return (
    left.kitchenName === right.kitchenName &&
    left.displayName === right.displayName &&
    left.description === right.description &&
    left.phoneNumber === right.phoneNumber &&
    left.email === right.email &&
    left.addressLine1 === right.addressLine1 &&
    left.addressLine2 === right.addressLine2 &&
    left.landmark === right.landmark &&
    left.areaName === right.areaName &&
    left.city === right.city &&
    left.state === right.state &&
    left.postalCode === right.postalCode
  );
}

function withDraft(
  state: ChefEditProfileDraftState,
  formDraft: ChefEditProfileFormValues,
): ChefEditProfileDraftState {
  if (!state.originalProfile) {
    return state;
  }
  const originalValues = chefKitchenProfileToFormValues(state.originalProfile);
  return {
    ...state,
    formDraft,
    dirtyState: !formValuesEqual(formDraft, originalValues),
  };
}

export function reduceChefEditProfileDraft(
  state: ChefEditProfileDraftState,
  action: ChefEditProfileDraftAction,
): ChefEditProfileDraftState {
  switch (action.type) {
    case 'BEGIN': {
      if (
        state.originalProfile?.id === action.profile.id &&
        state.formDraft &&
        state.dirtyState
      ) {
        return state;
      }
      return {
        originalProfile: action.profile,
        formDraft: chefKitchenProfileToFormValues(action.profile),
        dirtyState: false,
      };
    }
    case 'REPLACE_DRAFT':
      return withDraft(state, action.values);
    case 'APPLY_ADDRESS':
      return state.formDraft
        ? withDraft(
            state,
            mergeChefEditProfileAddressSelection(
              state.formDraft,
              action.selection,
            ),
          )
        : state;
    case 'COMMIT':
      return {
        originalProfile: action.profile,
        formDraft: chefKitchenProfileToFormValues(action.profile),
        dirtyState: false,
      };
    case 'DISCARD':
      return EMPTY_STATE;
  }
}

interface ChefEditProfileDraftContextValue extends ChefEditProfileDraftState {
  begin: (profile: ChefKitchenProfile) => void;
  replaceDraft: (values: ChefEditProfileFormValues) => void;
  applyAddressSelection: (selection: ChefEditProfileAddressSelection) => void;
  commit: (profile: ChefKitchenProfile) => void;
  discard: () => void;
}

const ChefEditProfileDraftContext = React.createContext<
  ChefEditProfileDraftContextValue | undefined
>(undefined);

export function ChefEditProfileDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = React.useReducer(
    reduceChefEditProfileDraft,
    EMPTY_STATE,
  );

  const value = React.useMemo<ChefEditProfileDraftContextValue>(
    () => ({
      ...state,
      begin: profile => dispatch({type: 'BEGIN', profile}),
      replaceDraft: values => dispatch({type: 'REPLACE_DRAFT', values}),
      applyAddressSelection: selection =>
        dispatch({type: 'APPLY_ADDRESS', selection}),
      commit: profile => dispatch({type: 'COMMIT', profile}),
      discard: () => dispatch({type: 'DISCARD'}),
    }),
    [state],
  );

  return (
    <ChefEditProfileDraftContext.Provider value={value}>
      {children}
    </ChefEditProfileDraftContext.Provider>
  );
}

export function useChefEditProfileDraft(): ChefEditProfileDraftContextValue {
  const value = React.useContext(ChefEditProfileDraftContext);
  if (!value) {
    throw new Error(
      'useChefEditProfileDraft must be used within ChefEditProfileDraftProvider.',
    );
  }
  return value;
}
