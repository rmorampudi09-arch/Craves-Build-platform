import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {fetchOrderReceiptPdf, shareOrderReceipt} from './customerOrderReceiptApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {get: jest.fn(), post: jest.fn()},
}));

const mockFiles: {args: unknown[]; create: jest.Mock; write: jest.Mock; uri: string}[] = [];
jest.mock('expo-file-system', () => ({
  Paths: {cache: {uri: 'file:///data/user/0/com.cravesapp/cache/'}},
  File: jest.fn().mockImplementation((...args: unknown[]) => {
    const file = {args, create: jest.fn(), write: jest.fn(), uri: String(args[0])};
    mockFiles.push(file);
    return file;
  }),
}));
jest.mock('expo-sharing', () => ({shareAsync: jest.fn(async () => undefined)}));

const post = httpClient.post as jest.Mock;
const get = httpClient.get as jest.Mock;
const ORDER = '7f6a2c91-0000-4000-8000-000000000001';
const DOC = '11111111-2222-4333-8444-555555555555';
const PDF = Uint8Array.from('%PDF-1.7 receipt', char => char.charCodeAt(0));

const doc = (status: string, bytes: number | null = PDF.byteLength) => ({id: DOC, status, bytes});
const download = (bytes: Uint8Array = PDF) => bytes.slice().buffer;

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('fetchOrderReceiptPdf', () => {
  it('asks for the payment receipt with a fixed key and returns the checked PDF', async () => {
    post.mockResolvedValueOnce(doc('READY'));
    get.mockResolvedValueOnce(download());

    await expect(fetchOrderReceiptPdf(ORDER)).resolves.toEqual(PDF);
    expect(post).toHaveBeenCalledWith(
      '/api/v1/documents',
      {type: 'PAYMENT_RECEIPT', sourceId: ORDER, timezone: 'Asia/Kolkata', currency: 'INR'},
      {headers: {'Idempotency-Key': `mobile-PAYMENT_RECEIPT-${ORDER}`}},
    );
    expect(get).toHaveBeenCalledWith(`/api/v1/documents/${DOC}/download`, expect.objectContaining({responseType: 'arraybuffer'}));
  });

  it('waits while the PDF is being made', async () => {
    jest.useFakeTimers();
    try {
      post.mockResolvedValueOnce(doc('QUEUED', null));
      get.mockResolvedValueOnce(doc('RENDERING', null)).mockResolvedValueOnce(doc('READY')).mockResolvedValueOnce(download());
      const result = fetchOrderReceiptPdf(ORDER);
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toEqual(PDF);
      expect(get).toHaveBeenNthCalledWith(1, `/api/v1/documents/${DOC}`);
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to the order summary when the order cannot have a receipt', async () => {
    post
      .mockRejectedValueOnce(new AppApiError('DOCUMENT_SOURCE_NOT_ELIGIBLE', 'Not eligible', 422))
      .mockResolvedValueOnce(doc('READY'));
    get.mockResolvedValueOnce(download());

    await expect(fetchOrderReceiptPdf(ORDER)).resolves.toEqual(PDF);
    expect(post.mock.calls[1][1]).toMatchObject({type: 'ORDER_SUMMARY'});
  });

  it('tries once more with a new key after a saved failure, then gives up', async () => {
    post.mockResolvedValueOnce(doc('FAILED', null)).mockResolvedValueOnce(doc('FAILED', null));

    await expect(fetchOrderReceiptPdf(ORDER)).rejects.toMatchObject({code: 'DOCUMENT_FAILED'});
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][2].headers['Idempotency-Key']).not.toBe(`mobile-PAYMENT_RECEIPT-${ORDER}`);
  });

  it('saves the PDF under one full cache URI, never a folder join', async () => {
    const {shareAsync} = require('expo-sharing');
    await shareOrderReceipt(PDF, 'craves-receipt-7F6A2C91.pdf');

    const file = mockFiles[mockFiles.length - 1];
    expect(file.args).toEqual(['file:///data/user/0/com.cravesapp/cache/craves-receipt-7F6A2C91.pdf']);
    expect(file.create).toHaveBeenCalledWith({overwrite: true});
    expect(file.write).toHaveBeenCalledWith(PDF);
    expect(shareAsync).toHaveBeenCalledWith(file.uri, expect.objectContaining({mimeType: 'application/pdf'}));
  });

  it('refuses a download that is not the whole PDF', async () => {
    post.mockResolvedValueOnce(doc('READY', PDF.byteLength + 10));
    get.mockResolvedValueOnce(download());

    await expect(fetchOrderReceiptPdf(ORDER)).rejects.toMatchObject({code: 'INVALID_DOCUMENT_PDF'});
  });
});
