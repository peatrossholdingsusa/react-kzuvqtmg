/* global globalThis */
// Downloads the HealthSherpa benefits PDF and stores AgencyView's own copy.
//
// The stored PDF is tied to a specific enrollee, so treat it as PHI-associated:
// the storage adapter must encrypt at rest, restrict access to authorized
// AgencyView users, and follow the agency's retention schedule.
//
// The download runs after the enrollment record is saved. If it fails, the
// webhook still succeeds and the record keeps the HealthSherpa link as a
// fallback, along with the failure reason so the download can be retried.

import { parseBenefitsDocumentUrl } from './submissionWebhook';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function failure(reason, detail) {
  return { ok: false, reason, detail: detail || null };
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('Web Crypto is not available to hash the document');
  return toHex(await subtle.digest('SHA-256', bytes));
}

function isPdf(bytes) {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

// Returns { ok: true, bytes, sha256, size, contentType } or { ok: false, reason }.
// Reasons: invalid_url, unauthorized, expired_or_missing, http_error, timeout,
// network_error, too_large, not_pdf.
export async function downloadBenefitsDocument(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_PDF_BYTES } = {}
) {
  const { url: safeUrl, warning } = parseBenefitsDocumentUrl(url);
  if (!safeUrl) return failure('invalid_url', warning);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetchImpl(safeUrl, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      headers: { Accept: 'application/pdf' },
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    return failure(e && e.name === 'AbortError' ? 'timeout' : 'network_error', e && e.message);
  }

  let bytes;
  try {
    // A redirect must not downgrade the download to plain http.
    if (response.url && !response.url.startsWith('https:')) {
      return failure('invalid_url', 'redirected to a non-https URL');
    }
    if (response.status === 401 || response.status === 403) {
      return failure('unauthorized', `HTTP ${response.status}`);
    }
    if (response.status === 404 || response.status === 410) {
      return failure('expired_or_missing', `HTTP ${response.status}`);
    }
    if (!response.ok) {
      return failure('http_error', `HTTP ${response.status}`);
    }

    const declared = Number(response.headers && response.headers.get('content-length'));
    if (declared && declared > maxBytes) {
      return failure('too_large', `${declared} bytes`);
    }

    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (e) {
    return failure(e && e.name === 'AbortError' ? 'timeout' : 'network_error', e && e.message);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (bytes.length > maxBytes) return failure('too_large', `${bytes.length} bytes`);
  // Check the file itself, not the header: expired links often return an HTML error page.
  if (!isPdf(bytes)) return failure('not_pdf', 'response is not a PDF file');

  // Outside the download error handling: a hashing failure is a server bug, not a bad link.
  return {
    ok: true,
    bytes,
    size: bytes.length,
    contentType: 'application/pdf',
    sha256: await sha256Hex(bytes),
  };
}

// Downloads and stores the benefits PDF for one enrollment.
//
// `storage.put({ key, bytes, contentType })` must be idempotent for the same key.
// Keys use the content hash, so redeliveries and retries overwrite the same
// object instead of creating a copy.
export async function attachBenefitsDocument(
  store,
  enrollmentId,
  { storage, fetchImpl, now = () => new Date(), ...options } = {}
) {
  const record = store.get(enrollmentId);
  const doc = record && record.benefitsDocument;
  if (!doc || !doc.url) return { action: 'skipped_no_document', record };

  // Already have this exact document: nothing to do on a retry.
  if (doc.status === 'stored' && doc.storedFromUrl === doc.url) {
    return { action: 'skipped_already_stored', record };
  }

  const result = await downloadBenefitsDocument(doc.url, { fetchImpl, ...options });
  if (!result.ok) {
    const updated = store.setBenefitsDocument(enrollmentId, {
      ...doc,
      status: 'download_failed',
      failureReason: result.reason,
      lastAttemptAt: now().toISOString(),
    });
    return { action: 'download_failed', reason: result.reason, record: updated };
  }

  const key = `benefits-documents/${enrollmentId}/${result.sha256}.pdf`;
  const same = doc.status === 'stored' && doc.sha256 === result.sha256;
  if (!same) {
    await storage.put({ key, bytes: result.bytes, contentType: result.contentType });
  }

  const updated = store.setBenefitsDocument(enrollmentId, {
    url: doc.url,
    label: doc.label,
    hostedBy: doc.hostedBy,
    receivedAt: doc.receivedAt,
    status: 'stored',
    storageKey: key,
    storedFromUrl: doc.url,
    sha256: result.sha256,
    size: result.size,
    contentType: result.contentType,
    downloadedAt: same && doc.downloadedAt ? doc.downloadedAt : now().toISOString(),
  });
  return { action: same ? 'unchanged' : 'stored', record: updated };
}
