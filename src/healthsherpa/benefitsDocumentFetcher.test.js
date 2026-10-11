/**
 * @jest-environment node
 */
/* global globalThis */
import { parseSubmissionWebhook } from './submissionWebhook';
import { webcrypto } from 'crypto';
import { createEnrollmentStore } from './enrollmentStore';
import { attachBenefitsDocument, downloadBenefitsDocument } from './benefitsDocumentFetcher';

// Jest's node environment does not expose the Web Crypto global that Node 18+ and browsers have.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SOB_URL = 'https://medicare.healthsherpa.com/documents/sob/abc123.pdf';
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const NOW = () => new Date('2026-10-11T12:00:00Z');

function response({ status = 200, body = PDF_BYTES, url = SOB_URL, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function fakeFetch(res) {
  const fn = jest.fn(async () => (typeof res === 'function' ? res() : res));
  return fn;
}

function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    put: jest.fn(async ({ key, bytes, contentType }) => {
      objects.set(key, { bytes, contentType });
    }),
  };
}

function seed(store, overrides = {}) {
  const parsed = parseSubmissionWebhook(
    {
      medicare_application: {
        id: 'app-1',
        carrier_name: 'EmblemHealth',
        confirmation_number: 'EMB-1',
        plan_type: 'mapd',
        updated_at: '2026-10-10T12:00:00Z',
        benefits_document_url: SOB_URL,
        ...overrides,
      },
    },
    { receivedAt: new Date('2026-10-10T12:00:00Z') }
  );
  return store.upsert(parsed).record.id;
}

describe('downloadBenefitsDocument', () => {
  it('downloads and hashes a PDF', async () => {
    const result = await downloadBenefitsDocument(SOB_URL, { fetchImpl: fakeFetch(response()) });
    expect(result.ok).toBe(true);
    expect(result.size).toBe(PDF_BYTES.length);
    expect(result.contentType).toBe('application/pdf');
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not send cookies or credentials to HealthSherpa', async () => {
    const fetchImpl = fakeFetch(response());
    await downloadBenefitsDocument(SOB_URL, { fetchImpl });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit', method: 'GET' });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'expired_or_missing'],
    [410, 'expired_or_missing'],
    [500, 'http_error'],
  ])('maps HTTP %i to %s', async (status, reason) => {
    const result = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: fakeFetch(response({ status })),
    });
    expect(result).toMatchObject({ ok: false, reason });
  });

  it('rejects an HTML error page served with status 200', async () => {
    const body = new TextEncoder().encode('<html>Link expired</html>');
    const result = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: fakeFetch(response({ body })),
    });
    expect(result).toMatchObject({ ok: false, reason: 'not_pdf' });
  });

  it('rejects files over the size limit from the header and from the body', async () => {
    const byHeader = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: fakeFetch(response({ headers: { 'content-length': '999999999' } })),
    });
    expect(byHeader.reason).toBe('too_large');
    const byBody = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: fakeFetch(response()),
      maxBytes: 10,
    });
    expect(byBody.reason).toBe('too_large');
  });

  it('rejects redirects to plain http', async () => {
    const result = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: fakeFetch(response({ url: 'http://evil.example.com/a.pdf' })),
    });
    expect(result.reason).toBe('invalid_url');
  });

  it('never fetches invalid URLs', async () => {
    const fetchImpl = fakeFetch(response());
    // eslint-disable-next-line no-script-url
    const result = await downloadBenefitsDocument('javascript:alert(1)', { fetchImpl });
    expect(result.reason).toBe('invalid_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports network errors and timeouts', async () => {
    const network = await downloadBenefitsDocument(SOB_URL, {
      fetchImpl: jest.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    expect(network.reason).toBe('network_error');

    const hang = (u, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const timeout = await downloadBenefitsDocument(SOB_URL, { fetchImpl: hang, timeoutMs: 5 });
    expect(timeout.reason).toBe('timeout');
  });
});

describe('attachBenefitsDocument', () => {
  it('stores the PDF and records where it lives', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const id = seed(store);

    const res = await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response()),
      now: NOW,
    });

    expect(res.action).toBe('stored');
    const doc = store.get(id).benefitsDocument;
    expect(doc).toMatchObject({
      status: 'stored',
      url: SOB_URL,
      storedFromUrl: SOB_URL,
      size: PDF_BYTES.length,
      contentType: 'application/pdf',
      downloadedAt: NOW().toISOString(),
    });
    expect(doc.storageKey).toBe(`benefits-documents/${id}/${doc.sha256}.pdf`);
    expect(storage.objects.get(doc.storageKey).bytes).toEqual(PDF_BYTES);
  });

  it('does not download or store again on webhook retries', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const fetchImpl = fakeFetch(response());
    const id = seed(store);

    await attachBenefitsDocument(store, id, { storage, fetchImpl, now: NOW });
    // Redelivery of the same webhook, then another attach attempt.
    expect(seed(store)).toBe(id);
    const again = await attachBenefitsDocument(store, id, { storage, fetchImpl, now: NOW });

    expect(again.action).toBe('skipped_already_stored');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.objects.size).toBe(1);
    expect(store.all()).toHaveLength(1);
  });

  it('downloads again when a newer payload sends a new URL', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const id = seed(store);
    await attachBenefitsDocument(store, id, { storage, fetchImpl: fakeFetch(response()), now: NOW });

    const newUrl = 'https://medicare.healthsherpa.com/documents/sob/v2.pdf';
    const v2 = new TextEncoder().encode('%PDF-1.7\nversion two\n%%EOF');
    seed(store, { benefits_document_url: newUrl, updated_at: '2026-10-10T13:00:00Z' });
    const res = await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response({ body: v2, url: newUrl })),
      now: NOW,
    });

    expect(res.action).toBe('stored');
    expect(store.get(id).benefitsDocument.storedFromUrl).toBe(newUrl);
    expect(storage.objects.size).toBe(2);
  });

  it('reuses the same stored object when a new URL serves identical bytes', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const id = seed(store);
    await attachBenefitsDocument(store, id, { storage, fetchImpl: fakeFetch(response()), now: NOW });
    seed(store, {
      benefits_document_url: 'https://medicare.healthsherpa.com/documents/sob/copy.pdf',
      updated_at: '2026-10-10T13:00:00Z',
    });
    const res = await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response()),
      now: NOW,
    });
    expect(res.action).toBe('stored');
    expect(storage.objects.size).toBe(1);
  });

  it('keeps the HealthSherpa link and records the reason when download fails', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const id = seed(store);

    const res = await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response({ status: 410 })),
      now: NOW,
    });

    expect(res).toMatchObject({ action: 'download_failed', reason: 'expired_or_missing' });
    expect(store.get(id).benefitsDocument).toMatchObject({
      url: SOB_URL,
      status: 'download_failed',
      failureReason: 'expired_or_missing',
      lastAttemptAt: NOW().toISOString(),
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('retries a failed download and stores it once it succeeds', async () => {
    const store = createEnrollmentStore();
    const storage = fakeStorage();
    const id = seed(store);
    await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response({ status: 503 })),
      now: NOW,
    });
    const res = await attachBenefitsDocument(store, id, {
      storage,
      fetchImpl: fakeFetch(response()),
      now: NOW,
    });
    expect(res.action).toBe('stored');
    expect(store.get(id).benefitsDocument.failureReason).toBeUndefined();
  });

  it('does nothing for enrollments without a document', async () => {
    const store = createEnrollmentStore();
    const fetchImpl = fakeFetch(response());
    const id = seed(store, { benefits_document_url: null });
    const res = await attachBenefitsDocument(store, id, { storage: fakeStorage(), fetchImpl });
    expect(res.action).toBe('skipped_no_document');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
