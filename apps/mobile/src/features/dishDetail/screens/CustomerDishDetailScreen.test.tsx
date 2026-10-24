import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {CustomerDishDetailScreen} from './CustomerDishDetailScreen';

type BeforeRemove = (event: {data: {action: {type: string}}; preventDefault: () => void}) => void;
let mockBeforeRemove: BeforeRemove | undefined;
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: (_name: string, listener: BeforeRemove) => {
      mockBeforeRemove = listener;
      return () => undefined;
    },
    dispatch: mockDispatch,
    goBack: mockGoBack,
  }),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));
jest.mock('./CustomerDishDetailLegacyScreen', () => ({CustomerDishDetailScreen: () => null}));

describe('CustomerDishDetailScreen (dish popup)', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    act(() => {
      tree = renderer.create(<CustomerDishDetailScreen />);
    });
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('slides the sheet down before going back', () => {
    const action = {type: 'GO_BACK'};
    const preventDefault = jest.fn();
    act(() => mockBeforeRemove!({data: {action}, preventDefault}));
    expect(preventDefault).toHaveBeenCalled();

    act(() => {
      jest.runAllTimers();
    });
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('lets "View kitchen" replace the popup straight away', () => {
    const preventDefault = jest.fn();
    act(() => mockBeforeRemove!({data: {action: {type: 'REPLACE'}}, preventDefault}));
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('closes when the dim is tapped', () => {
    const dim = tree.root.find(node => node.props.accessibilityLabel === 'Close dish details' && node.props.onPress);
    act(() => dim.props.onPress());
    expect(mockGoBack).toHaveBeenCalled();
  });
});
