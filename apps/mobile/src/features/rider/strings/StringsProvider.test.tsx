// WORKPLAN P2-08: a live build shows riders English until a translation is signed off, whatever they picked before, and
// tells the native side (notifications, the online service's messages) the same language.
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RIDER_LANGUAGES, RiderStringsProvider, useStrings} from './StringsProvider';

jest.mock('../riderConfig', () => ({...jest.requireActual('../riderConfig'), isDemo: false}));

function Probe() {
  const {strings, language} = useStrings();
  return <Text>{`${language}|${strings.common.retry}`}</Text>;
}

it('keeps riders in English while no translation is signed off, and tells the native side', async () => {
  const setLanguage = jest.fn();
  NativeModules.CravesRiderOnline = {setLanguage};
  (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('te');
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <RiderStringsProvider>
        <Probe />
      </RiderStringsProvider>,
    );
  });

  expect(RIDER_LANGUAGES).toEqual(['en']);
  expect(tree.root.findByType(Text).props.children).toBe('en|Try again');
  expect(setLanguage.mock.calls).toEqual([['en']]);
  // The pick stays saved: the rider gets Telugu as soon as a build offers it.
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
