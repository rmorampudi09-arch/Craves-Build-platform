import {z} from 'zod';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';

// The same Craves PDF service the website uses (notification-service, PDF documents module).
const DOCUMENTS_PATH = '/api/v1/documents';
const POLL_MS = 1_000;
const MAX_WAIT_MS = 40_000;
const FAILED_MESSAGE = "Couldn't make the receipt. Try again.";

type ReceiptType = 'PAYMENT_RECEIPT' | 'ORDER_SUMMARY';

const documentSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['QUEUED', 'RENDERING', 'READY', 'FAILED']),
  bytes: z.number().int().positive().nullable().optional(),
});
type ReceiptDocument = z.infer<typeof documentSchema>;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function create(orderId: string, type: ReceiptType, fresh: boolean): Promise<ReceiptDocument> {
  // A fixed key per order and type returns the PDF the server already made instead of making another;
  // `fresh` gets past a saved failure, which the fixed key would keep returning.
  const key = `mobile-${type}-${orderId}${fresh ? `-${Date.now()}` : ''}`;
  const response = await httpClient.post<unknown>(
    DOCUMENTS_PATH,
    {type, sourceId: orderId, timezone: 'Asia/Kolkata', currency: 'INR'},
    {headers: {'Idempotency-Key': key}},
  );
  return documentSchema.parse(response);
}

/** A payment receipt, or the order summary for orders the service cannot make a receipt for (meal plans). */
async function createReceipt(orderId: string, fresh: boolean): Promise<ReceiptDocument> {
  try {
    return await create(orderId, 'PAYMENT_RECEIPT', fresh);
  } catch (error) {
    if (toAppApiError(error).code !== 'DOCUMENT_SOURCE_NOT_ELIGIBLE') throw error;
    return create(orderId, 'ORDER_SUMMARY', fresh);
  }
}

async function settle(document: ReceiptDocument): Promise<ReceiptDocument> {
  const deadline = Date.now() + MAX_WAIT_MS;
  let current = document;
  while (current.status === 'QUEUED' || current.status === 'RENDERING') {
    if (Date.now() > deadline) {
      throw new AppApiError('DOCUMENT_NOT_READY', 'The receipt is taking too long. Try again in a minute.');
    }
    await wait(POLL_MS);
    current = documentSchema.parse(await httpClient.get<unknown>(`${DOCUMENTS_PATH}/${current.id}`));
  }
  return current;
}

/** Makes (or reuses) the order's receipt PDF and returns its bytes, checked to be the whole PDF. */
export async function fetchOrderReceiptPdf(orderId: string): Promise<Uint8Array> {
  let ready = await settle(await createReceipt(orderId, false));
  if (ready.status === 'FAILED') ready = await settle(await createReceipt(orderId, true));
  if (ready.status === 'FAILED') throw new AppApiError('DOCUMENT_FAILED', FAILED_MESSAGE);

  const data = await httpClient.get<ArrayBuffer>(`${DOCUMENTS_PATH}/${ready.id}/download`, {
    responseType: 'arraybuffer',
    headers: {Accept: 'application/pdf'},
  });
  const bytes = new Uint8Array(data);
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  if (header !== '%PDF-' || (ready.bytes != null && bytes.byteLength !== ready.bytes)) {
    throw new AppApiError('INVALID_DOCUMENT_PDF', FAILED_MESSAGE);
  }
  return bytes;
}

/** Saves the PDF in the app's cache and opens the phone's share sheet (open, save to Files, send). */
export async function shareOrderReceipt(bytes: Uint8Array, fileName: string): Promise<void> {
  const {File, Paths}: typeof import('expo-file-system') = require('expo-file-system');
  const Sharing: typeof import('expo-sharing') = require('expo-sharing');
  // One full URI: React Native's URL cannot set `pathname`, so File(Paths.cache, name) points at the cache folder itself.
  const folder = Paths.cache.uri;
  const file = new File(`${folder}${folder.endsWith('/') ? '' : '/'}${fileName}`);
  file.create({overwrite: true});
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Your Craves receipt',
  });
}
