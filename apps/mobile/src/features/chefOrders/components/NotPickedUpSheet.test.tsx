import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {NotPickedUpSheet} from './NotPickedUpSheet';

const mockCreate = jest.fn();
jest.mock('../../chefSupport/api/chefSupportCasesApi', () => ({
  ...jest.requireActual('../../chefSupport/api/chefSupportCasesApi'),
  chefSupportCasesApi: {create: (...args: unknown[]) => mockCreate(...args)},
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));

const ORDER_ID = '00000000-0000-4000-8000-00000000e7cd';

describe('NotPickedUpSheet', () => {
  let tree: renderer.ReactTestRenderer;
  const onClose = jest.fn();
  const mount = () => {
    act(() => {
      tree = renderer.create(
        <ChefToastProvider>
          <NotPickedUpSheet onClose={onClose} orderId={ORDER_ID} />
        </ChefToastProvider>,
      );
    });
  };
  const find = (label: string) =>
    tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  const press = async (label: string) =>
    act(async () => {
      await find(label).props.onPress();
    });
  const allText = () => tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join(''));

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({});
  });
  afterEach(() => act(() => tree?.unmount()));

  it('asks what happened with the order and says where the answer goes', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'What happened with #0E7CD?',
        "Partner hasn't arrived yet",
        'Partner left without the order',
        'Partner asked me to cancel',
        'Something else',
        'Craves support gets this with the order attached and will call you if needed.',
      ]),
    );
  });

  it('sends the picked reason and the note to support with the order attached, once', async () => {
    mount();
    await press('Partner left without the order');
    act(() =>
      tree.root
        .findAll(node => node.props.accessibilityLabel === 'Details for support' && node.props.onChangeText)[0]
        .props.onChangeText('Waited 30 min'),
    );
    await press('Send to support');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      contextRole: 'CHEF',
      orderId: ORDER_ID,
      subject: 'Not picked up · #0E7CD',
      message: 'Partner left without the order\n\nWaited 30 min',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(allText()).toContain('Sent to Craves support');
  });

  it('says support is coming soon, and closes, when the route is not published', async () => {
    mockCreate.mockRejectedValueOnce(new AppApiError('HTTP_404', 'Not found', 404));
    mount();
    await press('Send to support');
    expect(allText()).toContain('Support is coming soon. Call Craves support.');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with a plain message when sending fails for another reason', async () => {
    mockCreate.mockRejectedValueOnce(new AppApiError('HTTP_500', 'boom', 500));
    mount();
    await press('Send to support');
    expect(onClose).not.toHaveBeenCalled();
    expect(allText()).toContain("We couldn't send this. Check your connection and try again.");
    expect(allText().join(' ')).not.toContain('boom');
  });

  it('sends only once on a double press', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockCreate.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    mount();
    await act(async () => {
      find('Send to support').props.onPress();
      find('Send to support').props.onPress();
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => finish({}));
  });
});
