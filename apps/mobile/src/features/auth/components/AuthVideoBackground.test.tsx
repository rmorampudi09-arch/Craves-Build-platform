import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState, Image} from 'react-native';
import {useVideoPlayer} from 'expo-video';
import {AuthVideoBackground} from './AuthVideoBackground';

let mockReduceMotion = false;
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => mockReduceMotion}));

describe('bundled auth background', () => {
  let tree: renderer.ReactTestRenderer;
  const originalAppState = AppState.currentState;
  const render = (enabled = true) => {
    act(() => {tree = renderer.create(<AuthVideoBackground enabled={enabled} />);});
    return jest.mocked(useVideoPlayer).mock.results.at(-1)?.value;
  };
  beforeEach(() => {
    mockReduceMotion = false;
    AppState.currentState = 'active';
    jest.mocked(useVideoPlayer).mockClear();
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
    AppState.currentState = originalAppState;
  });
  it('uses only a bundled asset, silently loops, and covers startup with a poster', () => {
    const player = render();
    expect(jest.mocked(useVideoPlayer).mock.calls[0][0]).not.toEqual(expect.objectContaining({uri: expect.any(String)}));
    expect(player).toMatchObject({loop: true, muted: true, volume: 0, audioMixingMode: 'mixWithOthers'});
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Image)).toHaveLength(2);
    const view = tree.root.findAll(node => Boolean(node.props.onFirstFrameRender))[0];
    expect(view.props.nativeControls).toBe(false);
    expect(view.props.allowsPictureInPicture).toBe(false);
    expect(view.props.surfaceType).toBe('textureView');
    act(() => view.props.onFirstFrameRender());
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
  });
  it('pauses in the background and resumes in the foreground', () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const player = render();
    const callback = listener.mock.calls.at(-1)![1];
    act(() => callback('background'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    act(() => callback('active'));
    expect(player.play).toHaveBeenCalledTimes(2);
  });
  it('releases the decoder and event subscriptions when hidden', () => {
    const player = render();
    const subscription = player.addListener.mock.results[0].value;
    act(() => tree.update(<AuthVideoBackground enabled={false} />));
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });
  it('does not create a player for reduced motion', () => {
    mockReduceMotion = true;
    render();
    expect(useVideoPlayer).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
  });
  it('does not create a player on the unchanged password recovery screens', () => {
    render(false);
    expect(useVideoPlayer).not.toHaveBeenCalled();
  });
  it('falls back without retrying playback after a native decoder error', () => {
    const player = render();
    const callback = player.addListener.mock.calls[0][1];
    act(() => callback({status: 'error'}));
    expect(tree.root.findAll(node => Boolean(node.props.onFirstFrameRender))).toHaveLength(0);
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.addListener.mock.results[0].value.remove).toHaveBeenCalled();
  });
});
