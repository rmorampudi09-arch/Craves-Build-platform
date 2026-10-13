import React from 'react';
import {Image, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerChefFace} from './CustomerChefFace';

const FACE = 'https://media.craves.test/public/chef-avatars/chef-avatar-04.jpg';
const fallback = <Text>KM</Text>;

describe('CustomerChefFace', () => {
  let tree: renderer.ReactTestRenderer;
  const render = (url: string | null | undefined) => {
    act(() => {
      tree = renderer.create(<CustomerChefFace url={url} fallback={fallback} />);
    });
    return tree.root;
  };
  afterEach(() => act(() => tree?.unmount()));

  it('shows the hosted face and not the fallback', () => {
    const root = render(FACE);

    expect(root.findByType(Image).props.source).toEqual({uri: FACE});
    expect(root.findAllByType(Text)).toHaveLength(0);
  });

  it.each([
    ['http:', 'http://media.craves.test/public/chef-avatars/chef-avatar-04.jpg'],
    ['missing', null],
    ['absent', undefined],
    ['blank', ''],
  ])('shows the fallback for a %s url', (_label, url) => {
    const root = render(url);

    expect(root.findAllByType(Image)).toHaveLength(0);
    expect(root.findByType(Text).props.children).toBe('KM');
  });

  it('switches to the fallback when the face fails to load', () => {
    const root = render(FACE);

    act(() => root.findByType(Image).props.onError());

    expect(root.findAllByType(Image)).toHaveLength(0);
    expect(root.findByType(Text).props.children).toBe('KM');
  });

  it('tries a new face after the old one failed', () => {
    const root = render(FACE);
    act(() => root.findByType(Image).props.onError());

    const next = FACE.replace('04', '05');
    act(() => tree.update(<CustomerChefFace url={next} fallback={fallback} />));

    expect(root.findByType(Image).props.source).toEqual({uri: next});
  });
});
