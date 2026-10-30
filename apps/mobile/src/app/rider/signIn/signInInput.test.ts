import {codeDigits, mobileDigits} from './signInInput';

describe('mobileDigits', () => {
  it.each([
    ['9848012345', '9848012345'],
    ['98480 12345', '9848012345'],
    ['+91 98480 12345', '9848012345'],
    ['+91-98480-12345', '9848012345'],
    ['098480-12345', '9848012345'],
    ['0091 98480 12345', '9848012345'],
    ['919848012345', '9848012345'],
    // A number that starts with 91 is the rider's own while it is typed, and an extra digit never shifts it.
    ['9198765432', '9198765432'],
    ['91987654321', '9198765432'],
    ['98480123456', '9848012345'],
    ['', ''],
  ])('%j → %j', (text, digits) => expect(mobileDigits(text)).toBe(digits));
});

describe('codeDigits', () => {
  it.each([
    ['482615', '482615'],
    ['48 26 15', '482615'],
    ['4826159', '482615'],
    ['Your Craves code is 482616. It expires in 15 minutes.', '482616'],
    // Other numbers in the message are not the code.
    ['Order 12 is on its way. Your Craves code is 482616.', '482616'],
    ['', ''],
  ])('%j → %j', (text, digits) => expect(codeDigits(text)).toBe(digits));
});
