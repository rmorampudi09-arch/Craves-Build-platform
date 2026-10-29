// WORKPLAN P2-08: Telugu, Hindi and Kannada keep every key, list and placeholder English has, in their own script.
import {en} from './en';
import {hi} from './hi';
import {kn} from './kn';
import {languagesFor, serverLanguage} from './StringsProvider';
import {te} from './te';

type Leaf = string | ((...args: unknown[]) => unknown);
const MARKS = ['⟨0⟩', '⟨1⟩', '⟨2⟩'];

/** Every text and function under value, by its path ("trip.titles.AT_DROP", "help.faqs.0.q"). */
function leaves(value: unknown, path = '', out = new Map<string, Leaf>()): Map<string, Leaf> {
  if (typeof value === 'string' || typeof value === 'function') {
    out.set(path, value as Leaf);
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => leaves(child, path ? `${path}.${key}` : key, out));
  }
  return out;
}

/** A text as shown: a function is called with markers, so each argument it prints can be found. */
const shown = (leaf: Leaf) => {
  const text = typeof leaf === 'function' ? leaf(...MARKS) : leaf;
  return Array.isArray(text) ? text.join('') : String(text);
};
const marks = (text: string) => MARKS.filter(mark => text.includes(mark));

const ENGLISH = leaves(en);
// The same in every language: names, codes, and lines that only join other texts.
const SAME = new Set([
  'signIn.brand',
  'common.sos',
  'account.payout.methods.UPI',
  'account.payout.upiId',
  'account.payout.ifsc',
  'languages.en',
  'languages.te',
  'languages.hi',
  'languages.kn',
  'earnings.dated',
  'help.tripRow',
]);

describe.each([
  ['te', te, /[ఀ-౿]/],
  ['hi', hi, /[ऀ-ॿ]/],
  ['kn', kn, /[ಀ-೿]/],
])('%s', (_code, strings, script) => {
  const translated = leaves(strings);

  it('has exactly the keys, lists and parameters English has', () => {
    expect([...translated.keys()].sort()).toEqual([...ENGLISH.keys()].sort());
    ENGLISH.forEach((leaf, path) => {
      const other = translated.get(path);
      expect([path, typeof other]).toEqual([path, typeof leaf]);
      if (typeof leaf === 'function' && typeof other === 'function') {
        expect([path, other.length]).toEqual([path, leaf.length]);
      }
    });
  });

  it('prints every argument English prints', () => {
    ENGLISH.forEach((leaf, path) => {
      expect([path, marks(shown(translated.get(path)!))]).toEqual([path, marks(shown(leaf))]);
    });
  });

  it('translates every text, in its own script', () => {
    translated.forEach((leaf, path) => {
      const text = shown(leaf);
      expect([path, text.trim().length > 0]).toEqual([path, true]);
      if (!SAME.has(path)) {
        expect([path, text === shown(ENGLISH.get(path)!)]).toEqual([path, false]);
        expect([path, script.test(text)]).toEqual([path, true]);
      }
    });
  });
});

describe('languagesFor', () => {
  it('offers riders English plus each signed-off language, and demo builds every language', () => {
    expect(languagesFor(false, [])).toEqual(['en']);
    expect(languagesFor(false, ['hi'])).toEqual(['en', 'hi']);
    expect(languagesFor(false, ['kn'])).toEqual(['en', 'kn']);
    expect(languagesFor(true, [])).toEqual(['en', 'te', 'hi', 'kn']);
  });

  it('keeps a Kannada reader in English on the server, which stores only en, te and hi', () => {
    expect([serverLanguage('kn'), serverLanguage('te'), serverLanguage('hi'), serverLanguage('en')]).toEqual(['en', 'te', 'hi', 'en']);
  });
});
