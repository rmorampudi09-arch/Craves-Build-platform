/**
 * @format
 */

import React from 'react';
import {Text, View} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactElement} from 'react';
import {
  ContentLifecycle,
  ListSkeleton,
  PermissionState,
  SectionSkeleton,
} from '../src/shared/components';

async function render(element: ReactElement) {
  let renderer: ReturnType<typeof ReactTestRenderer.create> | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });

  if (!renderer) {
    throw new Error('Expected renderer to be created');
  }

  return renderer;
}

describe('shared lifecycle primitives', () => {
  test('keeps prior valid content visible during background refresh', async () => {
    const renderer = await render(
      <ContentLifecycle
        hasContent
        refreshing
        skeleton={<View testID="initial-skeleton" />}>
        <Text testID="valid-content">Already loaded</Text>
      </ContentLifecycle>,
    );

    expect(renderer.root.findByProps({testID: 'valid-content'})).toBeTruthy();
    expect(renderer.root.findAllByProps({testID: 'initial-skeleton'})).toHaveLength(
      0,
    );
  });

  test('uses a skeleton only for initial loading without valid content', async () => {
    const renderer = await render(
      <ContentLifecycle
        hasContent={false}
        loading
        skeleton={<View testID="initial-skeleton" />}>
        <Text testID="unavailable-content">Unavailable</Text>
      </ContentLifecycle>,
    );

    expect(renderer.root.findByProps({testID: 'initial-skeleton'})).toBeTruthy();
    expect(
      renderer.root.findAllByProps({testID: 'unavailable-content'}),
    ).toHaveLength(0);
  });

  test('renders reusable section, list, and permission states', async () => {
    const renderer = await render(
      <View>
        <SectionSkeleton testID="section-skeleton" />
        <ListSkeleton testID="list-skeleton" count={2} />
        <PermissionState
          testID="permission-state"
          title="Permission required"
          description="Permission details"
          actionLabel="Continue"
          onAction={() => undefined}
        />
      </View>,
    );

    expect(renderer.root.findByProps({testID: 'section-skeleton'})).toBeTruthy();
    expect(renderer.root.findByProps({testID: 'list-skeleton'})).toBeTruthy();
    expect(renderer.root.findByProps({testID: 'permission-state'})).toBeTruthy();
  });
});
