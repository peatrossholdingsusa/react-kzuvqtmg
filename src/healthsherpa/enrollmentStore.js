// Idempotent upsert of parsed HealthSherpa enrollments.
//
// HealthSherpa retries a failed delivery up to three times (20s, 10m, 1h), and
// the same enrollment can arrive more than once. Records are keyed by the
// HealthSherpa application id, with carrier + confirmation number as a second
// key, so a retry updates the existing record instead of creating a new one.
//
// This in-memory store holds the merge rules. A persistent backend must apply
// the same rules and back them with unique constraints on both keys.

function confirmationKey(record) {
  if (!record.confirmationNumber) return null;
  const carrier = record.carrierId || (record.carrierName || '').toLowerCase();
  return `${carrier}|${record.confirmationNumber}`;
}

function isOlder(incoming, existing) {
  if (!incoming.updatedAt || !existing.updatedAt) return false;
  return Date.parse(incoming.updatedAt) < Date.parse(existing.updatedAt);
}

// There is one benefits document slot per enrollment, so links never pile up.
// A payload without the field (older or carrier-specific payloads) keeps the
// existing link, and a retry with the same URL keeps the original receivedAt.
function mergeBenefitsDocument(existing, incoming) {
  if (!incoming) return existing || null;
  if (existing && existing.url === incoming.url) return existing;
  return incoming;
}

export function createEnrollmentStore() {
  const records = new Map(); // internal id -> record
  const byApplicationId = new Map();
  const byConfirmation = new Map();
  let nextId = 1;

  function find(parsed) {
    const fromApp = parsed.applicationId && byApplicationId.get(parsed.applicationId);
    if (fromApp) return records.get(fromApp);
    const key = confirmationKey(parsed);
    const fromConf = key && byConfirmation.get(key);
    return fromConf ? records.get(fromConf) : null;
  }

  function index(record) {
    if (record.applicationId) byApplicationId.set(record.applicationId, record.id);
    const key = confirmationKey(record);
    if (key) byConfirmation.set(key, record.id);
  }

  function upsert(parsed) {
    const existing = find(parsed);
    if (!existing) {
      const { warnings, ...fields } = parsed;
      const record = { ...fields, id: `enr_${nextId++}` };
      records.set(record.id, record);
      index(record);
      return { action: 'created', record };
    }

    if (isOlder(parsed, existing)) {
      return { action: 'ignored_stale', record: existing };
    }

    const { warnings, ...fields } = parsed;
    const merged = { ...existing };
    // Only overwrite with values that are present, so a sparser payload cannot
    // erase fields that an earlier delivery already filled in.
    Object.entries(fields).forEach(([key, value]) => {
      if (key === 'benefitsDocument') return;
      if (value !== null && value !== undefined) merged[key] = value;
    });
    merged.benefitsDocument = mergeBenefitsDocument(existing.benefitsDocument, parsed.benefitsDocument);
    merged.id = existing.id;

    records.set(merged.id, merged);
    index(merged);
    return { action: 'updated', record: merged };
  }

  return {
    upsert,
    get: (id) => records.get(id) || null,
    all: () => Array.from(records.values()),
  };
}
