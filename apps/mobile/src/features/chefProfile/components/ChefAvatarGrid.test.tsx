import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ChefAvatarGrid} from './ChefAvatarGrid';

describe('ChefAvatarGrid', () => {
  let tree: renderer.ReactTestRenderer;
  const mount = (element: React.ReactElement) => {
    act(() => {
      tree = renderer.create(element);
    });
  };
  afterEach(() => act(() => tree?.unmount()));

  const faces = () => tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');
  const face = (label: string) => faces().find(n => n.props.accessibilityLabel === label)!;

  it('offers 18 faces, marks the picked one and reports a tap', () => {
    const onSelect = jest.fn();
    mount(<ChefAvatarGrid selectedId="chef-avatar-04" onSelect={onSelect} />);

    expect(faces().map(n => n.props.accessibilityLabel)).toEqual(Array.from({length: 18}, (_, i) => `Picture ${i + 1}`));
    expect(face('Picture 4').props.accessibilityState).toMatchObject({selected: true});
    expect(faces().filter(n => n.props.accessibilityState?.selected)).toHaveLength(1);

    act(() => face('Picture 17').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('chef-avatar-17');
  });

  it('marks nothing when no face is picked', () => {
    mount(<ChefAvatarGrid selectedId={null} onSelect={jest.fn()} />);
    expect(faces().filter(n => n.props.accessibilityState?.selected)).toHaveLength(0);
  });

  it('blocks taps while disabled', () => {
    mount(<ChefAvatarGrid disabled selectedId={null} onSelect={jest.fn()} />);
    expect(face('Picture 1').props.disabled).toBe(true);
    expect(face('Picture 1').props.accessibilityState).toMatchObject({disabled: true});
  });
});
