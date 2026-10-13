import {Switch, Text} from 'react-native';
import {act, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

// Every string in a subtree, in reading order (a row's meta line can nest a second Text).
export const textIn = (node: unknown): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textIn).join('');
  const instance = node as ReactTestInstance;
  return instance.type === Text ? textIn(instance.props.children) : '';
};

/** Small finders over a rendered screen, shared by the Profile screen tests. */
export function screenQueries(getTree: () => ReactTestRenderer) {
  const lines = () => {
    const all = getTree().root.findAllByType(Text);
    return all
      .filter(node => !all.some(outer => outer !== node && outer.findAllByType(Text).includes(node)))
      .map(node => textIn(node.props.children));
  };
  const pressable = (match: (label: string) => boolean): ReactTestInstance | undefined =>
    getTree().root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        match(node.props.accessibilityLabel) &&
        typeof node.props.onPress === 'function',
    )[0];
  const byLabel = (label: string) => pressable(candidate => candidate === label);
  const byPrefix = (prefix: string) => pressable(candidate => candidate === prefix || candidate.startsWith(`${prefix},`));
  const switchFor = (label: string): ReactTestInstance | undefined =>
    getTree().root.findAll(node => node.type === Switch && node.props.accessibilityLabel === label)[0];
  return {
    lines,
    has: (text: string) => lines().includes(text),
    anyText: (pattern: RegExp) => pattern.test(lines().join('\n')),
    byLabel,
    byPrefix,
    switchFor,
    // The handler's own promise is not awaited: a request the test holds open would never let the press finish.
    press: (label: string) =>
      act(async () => {
        const target = byLabel(label) ?? byPrefix(label);
        if (!target) throw new Error(`Nothing to press: ${label}`);
        target.props.onPress();
      }),
    // For a dialog button that shares its words with a row behind it: the dialog is drawn last.
    pressLast: (label: string) =>
      act(async () => {
        const all = getTree().root.findAll(
          node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
        );
        if (all.length === 0) throw new Error(`Nothing to press: ${label}`);
        all[all.length - 1].props.onPress();
      }),
    toggle: (label: string, value: boolean) =>
      act(async () => {
        const target = switchFor(label);
        if (!target) throw new Error(`No switch: ${label}`);
        target.props.onValueChange(value);
      }),
    settle: () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 0))),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}
