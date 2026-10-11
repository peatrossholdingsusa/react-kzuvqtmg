// Parser for the HealthSherpa Medicare enrollment Submission webhook.
// Schema: https://docs.medicare.healthsherpa.com/webhooks/event-types/submission
//
// The parser is deliberately tolerant: unknown fields are ignored and optional
// fields (benefits_document_url included) may be absent, null or malformed
// without rejecting the payload. Only the identifiers needed to dedupe an
// enrollment are required.

import { normalizeCarrier } from './carriers';

const MAX_URL_LENGTH = 2048;

// Returns a safe https URL string, or null. A bad URL never fails the webhook;
// it is reported in `warnings` and stored as null.
export function parseBenefitsDocumentUrl(value) {
  if (value === undefined || value === null || value === '') {
    return { url: null, warning: null };
  }
  if (typeof value !== 'string') {
    return { url: null, warning: 'benefits_document_url is not a string' };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    return { url: null, warning: 'benefits_document_url exceeds maximum length' };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    return { url: null, warning: 'benefits_document_url is not a valid URL' };
  }
  // Only https: blocks javascript:, data: and plain-http links to PHI-adjacent documents.
  if (parsed.protocol !== 'https:') {
    return { url: null, warning: 'benefits_document_url must use https' };
  }
  if (parsed.username || parsed.password) {
    return { url: null, warning: 'benefits_document_url must not embed credentials' };
  }
  return { url: parsed.toString(), warning: null };
}

export function normalizeConfirmationNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase().replace(/\s+/g, '');
  return normalized || null;
}

function str(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

export class WebhookPayloadError extends Error {}

// Maps a raw Submission payload to AgencyView's Medicare enrollment record.
// `receivedAt` is injectable for tests.
export function parseSubmissionWebhook(payload, { receivedAt = new Date() } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new WebhookPayloadError('Payload must be a JSON object');
  }
  const app = payload.medicare_application;
  if (!app || typeof app !== 'object') {
    throw new WebhookPayloadError('Missing medicare_application');
  }

  const applicationId = str(app.id);
  const confirmationNumber = normalizeConfirmationNumber(app.confirmation_number);
  if (!applicationId && !confirmationNumber) {
    throw new WebhookPayloadError(
      'medicare_application needs an id or confirmation_number to be deduplicated'
    );
  }

  const warnings = [];
  const carrier = normalizeCarrier(app.carrier_name);
  if (!carrier.recognized) {
    warnings.push(`Unrecognized carrier: ${carrier.raw || '(blank)'}`);
  }

  // HealthSherpa-hosted link. Store the reference only; never download it here.
  // Expiration and auth behavior are unconfirmed, so it is not treated as permanent.
  const benefits = parseBenefitsDocumentUrl(app.benefits_document_url);
  if (benefits.warning) warnings.push(benefits.warning);

  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {};
  const riders = Array.isArray(payload.medicare_application_riders)
    ? payload.medicare_application_riders
    : [];

  return {
    source: 'healthsherpa_medicare',
    applicationId,
    confirmationNumber,
    carrierId: carrier.id,
    carrierName: carrier.name,
    carrierNameRaw: carrier.raw || null,
    carrierRecognized: carrier.recognized,
    cmsPlanId: str(app.cms_plan_id),
    planName: str(app.plan_name),
    planType: str(app.plan_type),
    planSubType: str(app.plan_sub_type),
    planYear: Number.isInteger(app.plan_year) ? app.plan_year : null,
    effectiveDate: str(app.effective_date),
    state: str(app.state),
    zipCode: str(app.zip_code),
    totalPremiumCents: Number.isInteger(app.total_premium_cents) ? app.total_premium_cents : null,
    riders: riders.map((r) => ({
      planName: str(r && r.plan_name),
      premiumCents: r && Number.isInteger(r.premium_cents) ? r.premium_cents : null,
    })),
    agent: {
      npn: str(app.submitting_agent_npn),
      email: str(app.submitting_agent_email),
      firstName: str(app.submitting_agent_first_name),
      lastName: str(app.submitting_agent_last_name),
    },
    contactId: str(contact.id),
    contactExternalId: str(contact.external_id),
    submittedAt: str(app.submitted_at),
    updatedAt: str(app.updated_at),
    benefitsDocument: benefits.url
      ? {
          url: benefits.url,
          // Outline of Coverage for Med Supp, Summary of Benefits otherwise.
          label: app.plan_type === 'med_supp' ? 'Outline of Coverage' : 'Summary of Benefits',
          hostedBy: 'healthsherpa',
          receivedAt: receivedAt.toISOString(),
        }
      : null,
    warnings,
  };
}
