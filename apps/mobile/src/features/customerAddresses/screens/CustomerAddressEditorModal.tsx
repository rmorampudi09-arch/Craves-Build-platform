import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, KeyboardAvoidingView, Linking, Modal, StyleSheet} from 'react-native';
import * as Location from 'expo-location';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {MapPoint} from '../../maps/OlaMapPicker';
import {
  customerAddressesApi,
  type CustomerLocationSuggestion,
} from '../api/customerAddressesApi';
import {AddressDetailsStep} from '../components/AddressDetailsStep';
import {AddressMapStep, type PinLookupState} from '../components/AddressMapStep';
import {AddressSearchStep} from '../components/AddressSearchStep';
import {
  isCustomerAddressDeliveryReady,
  type CustomerAddress,
  type CustomerAddressLabel,
} from '../domain/customerAddressContract';
import {
  applyDetectedCustomerAddress,
  createCustomerAddressDraft,
  createCustomerAddressSavePlan,
  isCustomerAddressDraftDirty,
  updateCustomerAddressDraftText,
  type CustomerAddressDraft,
  type CustomerAddressFieldErrors,
  type CustomerAddressTextField,
} from '../domain/customerAddressEditor';
import {classifyLocationLookupError} from '../domain/locationLookup';
import {useLocationSearch} from '../hooks/useLocationSearch';
import {useSecondsUntil} from '../hooks/useSecondsUntil';
import {
  useCreateCustomerAddressMutation,
  useUpdateCustomerAddressMutation,
} from '../query/customerAddressQueries';

type Step = 'search' | 'map' | 'details';
type LocateOrigin = 'start' | 'search' | 'map';

interface Props {
  mode: 'add' | 'edit';
  address?: CustomerAddress;
  addresses: CustomerAddress[];
  /** Where a new address starts: place search (default) or straight to GPS. */
  start?: 'search' | 'current-location';
  /** Lets delivery pickers offer saved addresses in the search step. */
  onPickSavedAddress?: (address: CustomerAddress) => void;
  onSaved?: (address: CustomerAddress) => void;
  onClose: () => void;
}

/** Same as the server's CRAVES_LOCATION_SEARCH_CENTER (Hyderabad); used before any pin exists. */
const DEFAULT_CENTER: MapPoint = {latitude: 17.385, longitude: 78.4867};
const GPS_FAILED_COPY =
  'Could not get your current location. Check that location is on, then try again.';

function initialSteps(
  mode: Props['mode'],
  address: CustomerAddress | undefined,
  start: NonNullable<Props['start']>,
): Step[] {
  if (mode === 'edit') {
    return address?.latitude != null && address.longitude != null
      ? ['details']
      : ['details', 'map'];
  }
  return start === 'current-location' ? ['search', 'map'] : ['search'];
}

function isValidPoint(point: MapPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function CustomerAddressEditorModal({
  mode,
  address,
  addresses,
  start = 'search',
  onPickSavedAddress,
  onSaved,
  onClose,
}: Props) {
  const editingAddressId = mode === 'edit' ? address?.id ?? null : null;
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const [original] = useState<CustomerAddressDraft>(() => createCustomerAddressDraft(address));
  const [draft, setDraft] = useState<CustomerAddressDraft>(original);
  const [fieldErrors, setFieldErrors] = useState<CustomerAddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>(() => initialSteps(mode, address, start));
  const [pin, setPin] = useState<MapPoint>(() =>
    original.latitude !== null && original.longitude !== null
      ? {latitude: original.latitude, longitude: original.longitude}
      : selectedLocation
        ? {latitude: selectedLocation.latitude, longitude: selectedLocation.longitude}
        : DEFAULT_CENTER,
  );
  const [lookup, setLookup] = useState<PinLookupState>({status: 'idle'});
  const [gpsFix, setGpsFix] = useState<MapPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [pinStreet, setPinStreet] = useState<string | null>(null);
  const [houseNeedsInput, setHouseNeedsInput] = useState(false);
  const mounted = useRef(true);
  const locatingRef = useRef(false);
  const pinRef = useRef(pin);
  const lookupAbort = useRef<AbortController | null>(null);
  const lookupBlockedUntil = useRef(0);
  const lookupAutoRetried = useRef(false);
  const startedLocating = useRef(false);
  const createMutation = useCreateCustomerAddressMutation();
  const updateMutation = useUpdateCustomerAddressMutation();
  const reducedMotion = useReducedMotionPreference();
  const saving = createMutation.isPending || updateMutation.isPending;
  const step = steps[steps.length - 1];

  const search = useLocationSearch(
    gpsFix ??
      (draft.latitude !== null && draft.longitude !== null
        ? {latitude: draft.latitude, longitude: draft.longitude}
        : selectedLocation
          ? {latitude: selectedLocation.latitude, longitude: selectedLocation.longitude}
          : null),
  );

  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lookupAbort.current?.abort();
    };
  }, []);

  /** Moves forward, or back when the target is the step before this one. */
  const advance = useCallback((next: Step) => {
    setSteps(current => {
      if (current[current.length - 1] === next) return current;
      return current.length > 1 && current[current.length - 2] === next
        ? current.slice(0, -1)
        : [...current, next];
    });
  }, []);

  const requestClose = useCallback(() => {
    if (!isCustomerAddressDraftDirty(draft, original)) {
      onClose();
      return;
    }
    Alert.alert('Discard address changes?', 'Your unsaved address changes will be lost.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: onClose},
    ]);
  }, [draft, onClose, original]);

  const back = useCallback(() => {
    if (steps.length > 1) {
      setSteps(current => current.slice(0, -1));
      return;
    }
    requestClose();
  }, [requestClose, steps.length]);

  const lookUpPin = useCallback(async (point: MapPoint) => {
    lookupAbort.current?.abort();
    if (Date.now() < lookupBlockedUntil.current) {
      setLookup({status: 'limited', retryAt: lookupBlockedUntil.current});
      return;
    }
    const controller = new AbortController();
    lookupAbort.current = controller;
    setLookup({status: 'resolving'});
    try {
      const result = await customerAddressesApi.reverseGeocode(
        point.latitude,
        point.longitude,
        controller.signal,
      );
      if (!controller.signal.aborted && mounted.current) {
        setLookup({status: 'resolved', result, point});
      }
    } catch (caught) {
      if (controller.signal.aborted || !mounted.current) return;
      const failure = classifyLocationLookupError(caught);
      if (failure.kind === 'cancelled') return;
      if (failure.kind === 'limited') {
        lookupBlockedUntil.current = failure.retryAt;
        setLookup({status: 'limited', retryAt: failure.retryAt});
        return;
      }
      setLookup(
        failure.kind === 'unavailable'
          ? {status: 'unavailable'}
          : {status: 'failed', message: failure.message},
      );
    }
  }, []);

  const lookupSeconds = useSecondsUntil(lookup.status === 'limited' ? lookup.retryAt : null);

  // After Retry-After has passed the current pin is looked up once more, never in a loop.
  useEffect(() => {
    if (lookup.status === 'limited' && lookupSeconds === 0 && !lookupAutoRetried.current) {
      lookupAutoRetried.current = true;
      lookUpPin(pinRef.current).catch(() => undefined);
    }
  }, [lookUpPin, lookup.status, lookupSeconds]);

  const placePin = useCallback(
    (point: MapPoint) => {
      setPin(point);
      setMapNotice(null);
      lookupAutoRetried.current = false;
      lookUpPin(point).catch(() => undefined);
    },
    [lookUpPin],
  );

  const locate = useCallback(
    async (origin: LocateOrigin) => {
      if (locatingRef.current) return;
      locatingRef.current = true;
      setLocating(true);
      setLocationDenied(false);
      setLocationError(null);
      setMapNotice(null);
      try {
        // Permission is asked only now, when the customer chose current location.
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!mounted.current) return;
        if (permission.status !== Location.PermissionStatus.GRANTED) {
          if (origin === 'map') {
            setMapNotice(
              'Location access is off. Move the map to your building, or allow location in Settings.',
            );
          } else {
            setLocationDenied(true);
            if (origin === 'start') setSteps(['search']);
          }
          return;
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!mounted.current) return;
        const point = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        if (!isValidPoint(point)) {
          throw new Error('Invalid coordinates');
        }
        setGpsFix(point);
        advance('map');
        placePin(point);
      } catch {
        if (!mounted.current) return;
        if (origin === 'map') {
          setMapNotice(GPS_FAILED_COPY);
        } else {
          setLocationError(GPS_FAILED_COPY);
          if (origin === 'start') setSteps(['search']);
        }
      } finally {
        locatingRef.current = false;
        if (mounted.current) setLocating(false);
      }
    },
    [advance, placePin],
  );

  useEffect(() => {
    if (mode === 'add' && start === 'current-location' && !startedLocating.current) {
      startedLocating.current = true;
      locate('start').catch(() => undefined);
    }
  }, [locate, mode, start]);

  const pickResult = useCallback(
    (result: CustomerLocationSuggestion) => {
      advance('map');
      placePin({latitude: result.latitude, longitude: result.longitude});
    },
    [advance, placePin],
  );

  const confirmPin = useCallback(() => {
    if (lookup.status !== 'resolved') return;
    const {result, point} = lookup;
    setDraft(current =>
      applyDetectedCustomerAddress(current, {...result, ...point}, pinStreet),
    );
    setPinStreet(result.street);
    setHouseNeedsInput(!result.preciseHouseNumber);
    setFieldErrors({});
    setFormError(null);
    advance('details');
  }, [advance, lookup, pinStreet]);

  const enterManually = useCallback(() => {
    // The pin the customer placed is kept; only the written address is typed by hand.
    setDraft(current => ({...current, latitude: pin.latitude, longitude: pin.longitude}));
    setHouseNeedsInput(false);
    setFormError(null);
    advance('details');
  }, [advance, pin]);

  const changePin = useCallback(() => {
    if (draft.latitude !== null && draft.longitude !== null) {
      const point = {latitude: draft.latitude, longitude: draft.longitude};
      setPin(point);
      if (
        lookup.status === 'resolved' &&
        (lookup.point.latitude !== point.latitude ||
          lookup.point.longitude !== point.longitude)
      ) {
        setLookup({status: 'idle'});
      }
    }
    advance('map');
  }, [advance, draft.latitude, draft.longitude, lookup]);

  const updateText = useCallback((field: CustomerAddressTextField, value: string) => {
    setDraft(current => updateCustomerAddressDraftText(current, field, value));
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = {...current};
      delete next[field];
      return next;
    });
    setFormError(null);
  }, []);

  const changeLabel = useCallback((label: CustomerAddressLabel) => {
    setDraft(current => ({...current, addressLabel: label}));
  }, []);

  const pickSaved = useCallback(
    (saved: CustomerAddress) => {
      onPickSavedAddress?.(saved);
      onClose();
    },
    [onClose, onPickSavedAddress],
  );

  const save = useCallback(async () => {
    if (saving) return;
    const plan = createCustomerAddressSavePlan(draft, addresses, editingAddressId);
    if (plan.status === 'invalid') {
      setFieldErrors(plan.fieldErrors);
      setFormError(plan.formError);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    try {
      const saved = editingAddressId
        ? await updateMutation.mutateAsync({addressId: editingAddressId, request: plan.request})
        : await createMutation.mutateAsync(plan.request);
      onSaved?.(saved);
      Alert.alert(
        editingAddressId ? 'Address updated' : 'Address saved',
        editingAddressId
          ? 'Your saved address has been updated.'
          : 'Your delivery address has been saved.',
        [{text: 'Done', onPress: onClose}],
      );
    } catch (caught) {
      setFormError(toAppApiError(caught).message);
    }
  }, [addresses, createMutation, draft, editingAddressId, onClose, onSaved, saving, updateMutation]);

  return (
    <Modal
      animationType={resolveReducedMotionAnimation('slide' as const, reducedMotion)}
      onRequestClose={back}
      presentationStyle="fullScreen"
      visible>
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="customer-address-editor">
        {/* Edge-to-edge Android no longer shrinks the window for the keyboard, so the screen makes room itself. */}
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {step === 'search' ? (
            <AddressSearchStep
              limitedSeconds={search.limitedSeconds}
              locating={locating}
              locationDenied={locationDenied}
              locationError={locationError}
              onBack={back}
              onChangeQuery={search.setQuery}
              onOpenSettings={() => {
                Linking.openSettings().catch(() => undefined);
              }}
              onPickResult={pickResult}
              onPickSavedAddress={onPickSavedAddress ? pickSaved : undefined}
              onRetrySearch={search.retry}
              onSetOnMap={() => advance('map')}
              onUseCurrentLocation={() => {
                locate('search').catch(() => undefined);
              }}
              query={search.query}
              savedAddresses={
                onPickSavedAddress ? addresses.filter(isCustomerAddressDeliveryReady) : []
              }
              state={search.state}
            />
          ) : step === 'map' ? (
            <AddressMapStep
              limitedSeconds={lookupSeconds}
              locating={locating}
              locationNotice={mapNotice}
              lookup={lookup}
              onBack={back}
              onCenterChange={placePin}
              onConfirm={confirmPin}
              onEnterManually={enterManually}
              onOpenSearch={() => advance('search')}
              onRetryLookup={() => {
                lookUpPin(pin).catch(() => undefined);
              }}
              onUseCurrentLocation={() => {
                locate('map').catch(() => undefined);
              }}
              pin={pin}
            />
          ) : (
            <AddressDetailsStep
              draft={draft}
              fieldErrors={fieldErrors}
              formError={formError}
              houseNeedsInput={houseNeedsInput}
              mode={mode}
              onBack={back}
              onChangeLabel={changeLabel}
              onChangePin={changePin}
              onChangeText={updateText}
              onSave={() => {
                save().catch(() => undefined);
              }}
              saving={saving}
            />
          )}
        </KeyboardAvoidingView>
      </ScreenShell>
    </Modal>
  );
}

const styles = StyleSheet.create({flex: {flex: 1}});
