import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {HomeComingSoonPage, type HomeComingSoonPageProps} from './HomeComingSoonPage';

function render(overrides: Partial<HomeComingSoonPageProps> = {}) {
  const props: HomeComingSoonPageProps = {
    locationName: 'Kondapur',
    locationLabel: 'Home',
    subscribed: false,
    notifyPending: false,
    onNotify: jest.fn(),
    onChangeAddress: jest.fn(),
    refreshing: false,
    onRefresh: jest.fn(),
    topInset: 24,
    bottomPadding: 120,
    ...overrides,
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<HomeComingSoonPage {...props} />);
  });
  return {tree, props};
}

const text = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.type === 'string' && node.type === 'Text')
    .map(node => [node.props.children].flat().join(''))
    .join(' ');

describe('HomeComingSoonPage', () => {
  it('shows the bike, the area and both buttons', () => {
    const {tree, props} = render();

    expect(tree.root.findAllByProps({testID: 'empty-illustration-deliveryBike'})).not.toHaveLength(0);
    expect(text(tree)).toContain('Coming soon to Kondapur');
    expect(text(tree)).toContain('Delivering to Home');

    act(() => tree.root.findByProps({testID: 'coming-soon-notify'}).props.onPress());
    act(() => tree.root.findByProps({testID: 'coming-soon-change-address'}).props.onPress());
    expect(props.onNotify).toHaveBeenCalledTimes(1);
    expect(props.onChangeAddress).toHaveBeenCalledTimes(1);
  });

  it('swaps Notify me for the confirmation once subscribed', () => {
    const {tree} = render({subscribed: true});

    expect(tree.root.findAllByProps({testID: 'coming-soon-notify'})).toHaveLength(0);
    expect(tree.root.findAllByProps({testID: 'coming-soon-subscribed'})).not.toHaveLength(0);
    expect(text(tree)).toContain("You'll get a notification when it opens");
  });

  it('shows why saving failed', () => {
    const {tree} = render({notifyError: 'You can ask to be notified for up to 50 places'});

    expect(text(tree)).toContain('up to 50 places');
  });
});
