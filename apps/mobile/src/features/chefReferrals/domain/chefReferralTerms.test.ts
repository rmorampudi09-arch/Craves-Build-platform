import {CHEF_REFERRAL_TERMS_VERSION} from '../api/chefReferralEnrollApi';
import {CHEF_REFERRAL_TERMS, CHEF_REFERRAL_TERMS_VERSION_LABEL} from './chefReferralTerms';

// The app's tsconfig has no Node types: this test only needs these few calls.
declare const __dirname: string;
const fs = require('fs') as {readFileSync(file: string, encoding: 'utf8'): string; existsSync(file: string): boolean};
const path = require('path') as {resolve(...parts: string[]): string; join(...parts: string[]): string};

// The terms document lives in docs/referrals on main. Use it when this checkout has it; otherwise the copy kept
// beside this test. A changed terms document (or a changed copy) must fail here until the app text follows.
const repoDoc = path.resolve(__dirname, '../../../../../../docs/referrals/CHEF_REFERRAL_TERMS_V1.md');
const copy = path.join(__dirname, '__fixtures__', 'CHEF_REFERRAL_TERMS_V1.md');
const doc = fs.readFileSync(fs.existsSync(repoDoc) ? repoDoc : copy, 'utf8').replace(/\r\n/g, '\n');

/** The numbered items of the document as the app shows them: no bold marks, "-" bullets as "•", continuation lines joined by a line break. */
function itemsOf(markdown: string) {
  const items: {number: number; title: string; parts: string[]}[] = [];
  for (const line of markdown.split('\n')) {
    const item = /^(\d+)\. \*\*(.+?)\*\* (.*)$/.exec(line);
    if (item) {
      items.push({number: Number(item[1]), title: item[2], parts: [item[3]]});
    } else if (items.length > 0 && /^\s+\S/.test(line)) {
      items[items.length - 1].parts.push(line.trim().replace(/^- /, '• '));
    }
  }
  return items.map(({number, title, parts}) => ({number, title, body: parts.join('\n').replace(/\*\*/g, '')}));
}

describe('chef referral terms in the app', () => {
  it('say what the terms document says, item by item', () => {
    const fromDoc = itemsOf(doc);
    expect(fromDoc.length).toBeGreaterThan(0);
    expect(fromDoc.map(item => item.number)).toEqual(fromDoc.map((_item, index) => index + 1));
    expect(CHEF_REFERRAL_TERMS.map(({title, body}) => ({title, body}))).toEqual(
      fromDoc.map(({title, body}) => ({title, body})),
    );
  });

  it('are the version the server checks, and the plain-words label matches the document heading', () => {
    expect(doc).toContain(`\`${CHEF_REFERRAL_TERMS_VERSION}\``);
    expect(doc).toContain('(v1, 12 Oct 2026)');
    expect(CHEF_REFERRAL_TERMS_VERSION_LABEL).toBe('Version 1, 12 Oct 2026');
  });

  it('reads every part of an item, so a change to any of them shows up', () => {
    const changed = doc.replace('**₹250 or more**', '**₹300 or more**');
    expect(changed).not.toBe(doc);
    expect(itemsOf(changed)).not.toEqual(itemsOf(doc));
  });
});
