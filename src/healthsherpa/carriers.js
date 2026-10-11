// Carrier normalization for HealthSherpa Medicare enrollments.
//
// HealthSherpa sends `medicare_application.carrier_name` as free text, so the
// same carrier can arrive spelled several ways. Each entry maps those spellings
// to one canonical carrier so reconciliation, reporting and dedupe agree.
//
// Carriers missing from this table are NOT rejected: they pass through with
// `recognized: false` so a new carrier never blocks webhook ingestion.

export const CARRIERS = [
  {
    id: 'devoted_health',
    name: 'Devoted Health',
    aliases: ['Devoted', 'Devoted Health Plan'],
  },
  {
    // HealthSherpa direct enrollment enabled 2026-10-09.
    id: 'mytruadvantage',
    name: 'MyTruAdvantage',
    aliases: ['My Tru Advantage', 'MyTru Advantage', 'Tru Advantage', 'TruAdvantage'],
    directEnrollmentSince: '2026-10-09',
  },
  {
    // HealthSherpa direct enrollment enabled 2026-10-09.
    id: 'banner_health',
    name: 'Banner Health',
    aliases: ['Banner', 'Banner Medicare Advantage', 'Banner Health Medicare Advantage'],
    directEnrollmentSince: '2026-10-09',
  },
  {
    // HealthSherpa direct enrollment enabled 2026-10-09.
    id: 'emblemhealth',
    name: 'EmblemHealth',
    aliases: [
      'Emblem Health',
      'Emblem',
      'EmblemHealth Medicare',
      'EmblemHealth Medicare HMO',
      'EmblemHealth Medicare PPO',
      'HIP Health Plan of New York',
      'Group Health Incorporated',
    ],
    directEnrollmentSince: '2026-10-09',
  },
];

// Lowercase and drop everything but letters and digits, so "Emblem Health",
// "EMBLEMHEALTH" and "Emblem-Health, Inc." compare equal after suffix removal.
export function carrierKey(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(inc|llc|corp|corporation|co)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS_INDEX = CARRIERS.reduce((index, carrier) => {
  [carrier.name, ...carrier.aliases].forEach((alias) => {
    index[carrierKey(alias)] = carrier;
  });
  return index;
}, {});

export function normalizeCarrier(rawName) {
  const raw = typeof rawName === 'string' ? rawName.trim() : '';
  const carrier = ALIAS_INDEX[carrierKey(raw)];
  if (carrier) {
    return { id: carrier.id, name: carrier.name, raw, recognized: true };
  }
  return { id: null, name: raw || null, raw, recognized: false };
}
