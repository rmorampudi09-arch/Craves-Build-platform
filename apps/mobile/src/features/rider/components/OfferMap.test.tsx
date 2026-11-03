import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {OfferMap} from './OfferMap';

const kitchen = {lat: 17.4483, lng: 78.3915};
const area = {lat: 17.46, lng: 78.365};

describe('OfferMap', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterEach(() => {
    delete NativeModules.CravesRiderDevice;
  });
  afterAll(() => warn.mockRestore());

  async function render(element: React.ReactElement) {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('shows nothing without a Maps key in the build, and says so once', async () => {
    const first = await render(<OfferMap kitchen={kitchen} customerArea={area} label="Map" />);
    const second = await render(<OfferMap kitchen={kitchen} label="Map" />);
    expect(first.toJSON()).toBeNull();
    expect(second.toJSON()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('RIDER_MAPS_API_KEY');
  });

  it('draws the native lite-mode map with the kitchen and the area centre when the build has a key', async () => {
    NativeModules.CravesRiderDevice = {mapsKeyPresent: true};
    const tree = await render(<OfferMap kitchen={kitchen} customerArea={area} label="Map: the kitchen" />);
    const frame = tree.root.findByProps({testID: 'rider-offer-map'});
    expect(frame.props.accessibilityLabel).toBe('Map: the kitchen');
    expect(frame.props.pointerEvents).toBe('none');
    const map = tree.root.findByType('CravesRiderOfferMap' as never);
    expect(map.props).toMatchObject({kitchen, customerArea: area});
  });

  it('shows nothing when the server sent no kitchen position, even with a key', async () => {
    NativeModules.CravesRiderDevice = {mapsKeyPresent: true};
    const tree = await render(<OfferMap label="Map" />);
    expect(tree.toJSON()).toBeNull();
  });
});
