import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {areaCircle, OfferMap, offerBounds} from './OfferMap';

const kitchen = {lat: 17.4483, lng: 78.3915};
const area = {lat: 17.46, lng: 78.365};
const mockLastFix = jest.fn<{lat: number; lng: number} | undefined, []>(() => undefined);
jest.mock('../native/riderOnlineService', () => ({riderOnlineService: {lastFix: () => mockLastFix()}}));

describe('OfferMap', () => {
  async function render(element: React.ReactElement) {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('draws Ola tiles through the Craves proxy with the kitchen pinned and the area as a 300 m circle, nothing to tap', async () => {
    const tree = await render(<OfferMap kitchen={kitchen} customerArea={area} label="Map: the kitchen" />);
    const frame = tree.root.findByProps({testID: 'rider-offer-map'});
    expect(frame.props.accessibilityLabel).toBe('Map: the kitchen');
    expect(frame.props.pointerEvents).toBe('none');
    const map = tree.root.findByProps({testID: 'maplibre-Map'});
    expect(map.props.mapStyle).toBe('https://craves.in/api/location/map-tiles/styles/default-light-standard/style.json');
    expect(map.props.dragPan).toBe(false);
    expect(tree.root.findByProps({testID: 'maplibre-Camera'}).props.initialViewState.bounds).toEqual(offerBounds([kitchen, area]));
    expect(tree.root.findByProps({testID: 'maplibre-GeoJSONSource'}).props.data).toEqual(areaCircle(area));
    expect(tree.root.findAllByProps({testID: 'rider-offer-map-kitchen'}).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({testID: 'rider-offer-map-rider'})).toHaveLength(0);
  });

  it('adds the rider as a dot from the last fix, and widens the view to it', async () => {
    mockLastFix.mockReturnValueOnce({lat: 17.4, lng: 78.5});
    const tree = await render(<OfferMap kitchen={kitchen} label="Map" />);
    expect(tree.root.findAllByProps({testID: 'rider-offer-map-rider'}).length).toBeGreaterThan(0);
    expect(tree.root.findByProps({testID: 'maplibre-Camera'}).props.initialViewState.bounds).toEqual(offerBounds([kitchen, {lat: 17.4, lng: 78.5}]));
  });

  it('shows nothing, not a grey box, once the map fails to load', async () => {
    const tree = await render(<OfferMap kitchen={kitchen} customerArea={area} label="Map" />);
    await act(async () => tree.root.findByProps({testID: 'maplibre-Map'}).props.onDidFailLoadingMap());
    expect(tree.toJSON()).toBeNull();
  });

  it('shows nothing when the server sent no kitchen position', async () => {
    const tree = await render(<OfferMap label="Map" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('builds the circle and bounds in metres', () => {
    const ring = areaCircle(area).geometry.coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0][0] - area.lng).toBeCloseTo(300 / (111_320 * Math.cos((area.lat * Math.PI) / 180)), 6);
    const [w, s, e, n] = offerBounds([kitchen]);
    expect(n - s).toBeCloseTo((2 * 300) / 111_320, 6);
    expect(e - w).toBeGreaterThan(n - s);
  });
});
