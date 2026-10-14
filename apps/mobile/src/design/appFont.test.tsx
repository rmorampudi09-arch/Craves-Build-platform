import React from 'react';
import {StyleSheet} from 'react-native';
import renderer, {act, type ReactTestRenderer} from 'react-test-renderer';
import {APP_FONT_FAMILY, installAppFont, interTracking, withAppFont} from './appFont';

describe('app font', () => {
  it('tracks tighter as text grows, like SF Pro', () => {
    expect(interTracking(11)).toBeCloseTo(0.05, 2);
    expect(interTracking(17)).toBeCloseTo(-0.22, 2);
    expect(interTracking(34)).toBeCloseTo(-0.74, 2);
  });

  it('puts Inter under styles that name no font and leaves named fonts alone', () => {
    expect(StyleSheet.flatten(withAppFont({fontSize: 17, fontWeight: '700'}))).toEqual({
      fontFamily: APP_FONT_FAMILY,
      letterSpacing: -0.22,
      fontSize: 17,
      fontWeight: '700',
    });
    expect(StyleSheet.flatten(withAppFont({letterSpacing: 1}))).toMatchObject({letterSpacing: 1});
    const login = {fontFamily: 'CravesLoginBold'};
    expect(withAppFont(login)).toBe(login);
  });

  it('gives react-native Text the font, but lets nested Text inherit', () => {
    /* eslint-disable @react-native/no-deep-imports */
    const BaseText = require('react-native/Libraries/Text/Text').default;
    const TextAncestorContext = require('react-native/Libraries/Text/TextAncestorContext').default;
    /* eslint-enable @react-native/no-deep-imports */
    installAppFont();
    // Read through the react-native getter, as screens do, after the swap.
    const {Text} = require('react-native');
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <>
          <Text style={{fontSize: 15}}>Hello</Text>
          {/* The jest mock of Text does not provide this context; the real Text does for its children. */}
          <TextAncestorContext value>
            <Text style={{fontWeight: '700'}}>there</Text>
          </TextAncestorContext>
        </>,
      );
    });
    const [outer, inner] = tree.root.findAllByType(BaseText);
    expect(StyleSheet.flatten(outer.props.style)).toMatchObject({fontFamily: APP_FONT_FAMILY, fontSize: 15});
    expect(StyleSheet.flatten(inner.props.style)).toEqual({fontWeight: '700'});
    act(() => tree.unmount());
  });
});
