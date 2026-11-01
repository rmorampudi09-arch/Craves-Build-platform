import React, {useState} from 'react';
import {StyleSheet, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {borderWidth, colors} from '../../../design/tokens';
import {CodeBoxes} from './CodeBoxes';

let tree: renderer.ReactTestRenderer;
const onChange = jest.fn();

function Harness(props: {attemptsLeft?: number; lockedMessage?: string; initial?: string}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <CodeBoxes
      value={value}
      onChangeText={digits => {
        onChange(digits);
        setValue(digits);
      }}
      attemptsLeft={props.attemptsLeft}
      lockedMessage={props.lockedMessage}
      testID="otp"
    />
  );
}

function render(props: React.ComponentProps<typeof Harness> = {}) {
  act(() => {
    tree = renderer.create(<Harness {...props} />);
  });
}

const input = () => tree.root.findByType(TextInput);
const digits = () => [0, 1, 2, 3].map(i => tree.root.findByProps({testID: `otp-box-${i}`}).findByType(Text).props.children);
const boxStyle = (i: number) => StyleSheet.flatten(tree.root.findByProps({testID: `otp-box-${i}`}).props.style);
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

beforeEach(() => onChange.mockClear());
afterEach(() => act(() => tree?.unmount()));

describe('CodeBoxes', () => {
  it('is one numeric one-time-code field drawn as four boxes', () => {
    render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(input().props).toMatchObject({
      keyboardType: 'number-pad',
      textContentType: 'oneTimeCode',
      autoComplete: 'sms-otp',
      maxLength: 4,
      editable: true,
    });
    expect(digits()).toEqual(['', '', '', '']);
  });

  it('fills a box per digit and keeps only digits from a paste', () => {
    render();
    act(() => input().props.onChangeText('4 7-1'));
    expect(onChange).toHaveBeenLastCalledWith('471');
    expect(digits()).toEqual(['4', '7', '1', '']);
    act(() => input().props.onChangeText('47195'));
    expect(onChange).toHaveBeenLastCalledWith('4719');
  });

  it('reads the digits one by one to TalkBack and hides the boxes from it', () => {
    render({initial: '471'});
    expect(input().props.accessibilityLabel).toBe('4-digit OTP from the customer: 4 7 1');
    const hidden = tree.root.findAll(node => node.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('marks the next box while the field has focus', () => {
    render({initial: '47'});
    expect(boxStyle(2).borderWidth).toBe(borderWidth.standard);
    act(() => input().props.onFocus());
    expect(boxStyle(2).borderWidth).toBe(borderWidth.strong);
    act(() => input().props.onBlur());
    expect(boxStyle(2).borderWidth).toBe(borderWidth.standard);
  });

  it('says how many tries are left after a wrong code', () => {
    render({attemptsLeft: 3});
    expect(texts()).toContain('Wrong code. 3 tries left.');
    act(() => tree.update(<Harness attemptsLeft={1} />));
    expect(texts()).toContain('Wrong code. 1 try left.');
  });

  it('stops input and shows the server message once locked', () => {
    render({lockedMessage: 'Too many wrong OTPs. Use the photo option; ops will check it.'});
    expect(texts()).toContain('Too many wrong OTPs. Use the photo option; ops will check it.');
    expect(input().props.editable).toBe(false);
    expect(input().props.accessibilityState).toEqual({disabled: true});
    expect(boxStyle(0).backgroundColor).toBe(colors.muted);
  });
});
