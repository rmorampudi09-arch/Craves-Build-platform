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
  resolveContentLifecyclePrimaryState,
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

  test('resolves permission, terminal, and empty states explicitly', () => {
    const base = {
      hasContent: false,
      loading: false,
      empty: false,
      permissionBlocked: false,
      hasPermissionState: false,
      hasTerminalState: false,
      hasEmptyState: false,
    };

    expect(
      resolveContentLifecyclePrimaryState({
        ...base,
        permissionBlocked: true,
        hasPermissionState: true,
      }),
    ).toBe('permission');
    expect(
      resolveContentLifecyclePrimaryState({...base, hasTerminalState: true}),
    ).toBe('terminal');
    expect(
      resolveContentLifecyclePrimaryState({
        ...base,
        empty: true,
        hasEmptyState: true,
      }),
    ).toBe('empty');
  });

  test('renders explicit permission and empty surfaces without content', async () => {
    const permissionRenderer = await render(
      <ContentLifecycle
        hasContent={false}
        permissionBlocked
        permissionState={<View testID="permission-blocked" />}
        skeleton={<View testID="initial-skeleton" />}
      />,
    );
    expect(
      permissionRenderer.root.findByProps({testID: 'permission-blocked'}),
    ).toBeTruthy();

    const emptyRenderer = await render(
      <ContentLifecycle
        hasContent={false}
        empty
        emptyState={<View testID="empty-state" />}
        skeleton={<View testID="initial-skeleton" />}
      />,
    );
    expect(emptyRenderer.root.findByProps({testID: 'empty-state'})).toBeTruthy();
  });

  test('keeps content mounted for pagination loading and pagination errors', async () => {
    const loadingRenderer = await render(
      <ContentLifecycle
        hasContent
        loadingMore
        testID="orders"
        skeleton={<View testID="initial-skeleton" />}>
        <Text testID="paged-content">Loaded page</Text>
      </ContentLifecycle>,
    );

    expect(loadingRenderer.root.findByProps({testID: 'paged-content'})).toBeTruthy();
    expect(
      loadingRenderer.root.findByProps({testID: 'orders-pagination-loading'}),
    ).toBeTruthy();

    const errorRenderer = await render(
      <ContentLifecycle
        hasContent
        paginationError="Could not load more orders."
        testID="orders"
        skeleton={<View testID="initial-skeleton" />}>
        <Text testID="paged-content">Loaded page</Text>
      </ContentLifecycle>,
    );

    expect(errorRenderer.root.findByProps({testID: 'paged-content'})).toBeTruthy();
    expect(
      errorRenderer.root.findByProps({testID: 'orders-pagination-error'}),
    ).toBeTruthy();
  });

  test('keeps valid content visible when a mutation fails', async () => {
    const renderer = await render(
      <ContentLifecycle
        hasContent
        mutationError="Could not save this change."
        testID="profile"
        skeleton={<View testID="initial-skeleton" />}>
        <Text testID="profile-content">Existing profile</Text>
      </ContentLifecycle>,
    );

    expect(renderer.root.findByProps({testID: 'profile-content'})).toBeTruthy();
    expect(
      renderer.root.findByProps({testID: 'profile-mutation-error'}),
    ).toBeTruthy();
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
