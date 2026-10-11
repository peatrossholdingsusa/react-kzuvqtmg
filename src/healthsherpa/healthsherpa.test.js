import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { normalizeCarrier } from './carriers';
import {
  parseSubmissionWebhook,
  parseBenefitsDocumentUrl,
  WebhookPayloadError,
} from './submissionWebhook';
import { createEnrollmentStore } from './enrollmentStore';
import BenefitsDocumentLink from '../components/BenefitsDocumentLink';
import BenefitsDocumentViewer, { safeViewUrl } from '../components/BenefitsDocumentViewer';

const SOB_URL = 'https://medicare.healthsherpa.com/documents/sob/abc123.pdf';
const RECEIVED_AT = new Date('2026-10-10T12:00:00Z');

function payload(appOverrides = {}, extra = {}) {
  return {
    medicare_application: {
      id: 'ccf19b98-375f-4467-87f4-a47c977359ee',
      carrier_name: 'Devoted Health',
      cms_plan_id: 'H1290-001-000',
      confirmation_number: 'A92946987696546M',
      plan_name: 'DEVOTED CORE 001 FL (HMO)',
      plan_sub_type: 'hmo',
      plan_type: 'mapd',
      plan_year: 2026,
      state: 'FL',
      submitted_at: '2026-10-10T11:56:43.302Z',
      updated_at: '2026-10-10T11:56:52.627Z',
      submitting_agent_email: 'agent@example.com',
      submitting_agent_first_name: 'Heath',
      submitting_agent_last_name: 'Sherpa',
      submitting_agent_npn: '1234567890',
      total_premium_cents: 5000,
      ...appOverrides,
    },
    medicare_application_riders: [],
    contact: { id: '8b420678-2c58-4f56-9c0b-9ccb605e5e85', first_name: 'T', last_name: 'E' },
    ...extra,
  };
}

const parse = (p) => parseSubmissionWebhook(p, { receivedAt: RECEIVED_AT });

describe('benefits_document_url', () => {
  it('stores the Summary of Benefits link when present', () => {
    const record = parse(payload({ benefits_document_url: SOB_URL }));
    expect(record.benefitsDocument).toEqual({
      url: SOB_URL,
      label: 'Summary of Benefits',
      hostedBy: 'healthsherpa',
      receivedAt: RECEIVED_AT.toISOString(),
    });
    expect(record.warnings).toEqual([]);
  });

  it('labels Med Supp documents as Outline of Coverage', () => {
    const record = parse(payload({ plan_type: 'med_supp', benefits_document_url: SOB_URL }));
    expect(record.benefitsDocument.label).toBe('Outline of Coverage');
  });

  it('processes older payloads that do not include the field', () => {
    const record = parse(payload());
    expect(record.benefitsDocument).toBeNull();
    expect(record.applicationId).toBe('ccf19b98-375f-4467-87f4-a47c977359ee');
  });

  it('accepts null', () => {
    const record = parse(payload({ benefits_document_url: null }));
    expect(record.benefitsDocument).toBeNull();
    expect(record.warnings).toEqual([]);
  });

  it.each([
    ['not a url', 'not a valid URL'],
    ['http://medicare.healthsherpa.com/sob.pdf', 'https'],
    ['javascript:alert(1)', 'https'], // eslint-disable-line no-script-url
    ['data:application/pdf;base64,AAAA', 'https'],
    ['https://user:pass@example.com/sob.pdf', 'credentials'],
    [12345, 'not a string'],
    [`https://example.com/${'a'.repeat(3000)}`, 'maximum length'],
  ])('drops malformed value #%# with a warning instead of rejecting', (value, warning) => {
    const record = parse(payload({ benefits_document_url: value }));
    expect(record.benefitsDocument).toBeNull();
    expect(record.warnings.join(' ')).toContain(warning);
  });

  it('treats an empty string as absent', () => {
    expect(parseBenefitsDocumentUrl('')).toEqual({ url: null, warning: null });
  });
});

describe('payload tolerance', () => {
  it('ignores unknown fields', () => {
    const record = parse(payload({ some_future_field: { nested: true } }, { new_top_level: 1 }));
    expect(record.applicationId).toBeTruthy();
  });

  it('accepts limited contact payloads from independent agents', () => {
    const record = parse(payload({}, { contact: { id: 'c1', first_name: 'A', last_name: 'B' } }));
    expect(record.contactId).toBe('c1');
  });

  it('rejects payloads it cannot deduplicate', () => {
    expect(() => parse(payload({ id: null, confirmation_number: null }))).toThrow(
      WebhookPayloadError
    );
    expect(() => parse({})).toThrow(WebhookPayloadError);
    expect(() => parse(null)).toThrow(WebhookPayloadError);
  });

  it('keeps unknown carriers instead of rejecting them', () => {
    const record = parse(payload({ carrier_name: 'Brand New Plan Co' }));
    expect(record.carrierRecognized).toBe(false);
    expect(record.carrierName).toBe('Brand New Plan Co');
    expect(record.warnings).toContain('Unrecognized carrier: Brand New Plan Co');
  });
});

describe('newly enabled carriers', () => {
  it.each([
    ['MyTruAdvantage', 'mytruadvantage', 'MyTruAdvantage'],
    ['My Tru Advantage', 'mytruadvantage', 'MyTruAdvantage'],
    ['MYTRUADVANTAGE', 'mytruadvantage', 'MyTruAdvantage'],
    ['Banner Health', 'banner_health', 'Banner Health'],
    ['Banner Medicare Advantage', 'banner_health', 'Banner Health'],
    ['EmblemHealth', 'emblemhealth', 'EmblemHealth'],
    ['Emblem Health', 'emblemhealth', 'EmblemHealth'],
    ['EmblemHealth, Inc.', 'emblemhealth', 'EmblemHealth'],
    ['HIP Health Plan of New York', 'emblemhealth', 'EmblemHealth'],
  ])('maps %p to %p', (raw, id, name) => {
    expect(normalizeCarrier(raw)).toMatchObject({ id, name, recognized: true });
  });

  it.each([
    ['MyTruAdvantage', 'MTA-0001'],
    ['Banner Health', 'BNR-0001'],
    ['EmblemHealth', 'EMB-0001'],
  ])('ingests, attributes and dedupes a %s enrollment', (carrier, confirmation) => {
    const store = createEnrollmentStore();
    const p = payload({
      id: `app-${confirmation}`,
      carrier_name: carrier,
      confirmation_number: confirmation,
      benefits_document_url: SOB_URL,
    });

    const first = store.upsert(parse(p));
    expect(first.action).toBe('created');
    expect(first.record.carrierRecognized).toBe(true);
    expect(first.record.agent).toEqual({
      npn: '1234567890',
      email: 'agent@example.com',
      firstName: 'Heath',
      lastName: 'Sherpa',
    });

    // Same confirmation number, different application id and casing/spacing.
    const dup = payload({
      id: null,
      carrier_name: carrier.toUpperCase(),
      confirmation_number: ` ${confirmation.toLowerCase()} `,
    });
    expect(store.upsert(parse(dup)).action).toBe('updated');
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].benefitsDocument.url).toBe(SOB_URL);
  });
});

describe('webhook retries', () => {
  it('does not duplicate enrollments or document links on redelivery', () => {
    const store = createEnrollmentStore();
    const p = payload({ benefits_document_url: SOB_URL });
    store.upsert(parse(p));
    store.upsert(parseSubmissionWebhook(p, { receivedAt: new Date('2026-10-10T12:00:20Z') }));
    store.upsert(parseSubmissionWebhook(p, { receivedAt: new Date('2026-10-10T13:00:00Z') }));

    const all = store.all();
    expect(all).toHaveLength(1);
    expect(all[0].benefitsDocument).toEqual(
      expect.objectContaining({ url: SOB_URL, receivedAt: RECEIVED_AT.toISOString() })
    );
  });

  it('keeps an existing link when a later payload omits the field', () => {
    const store = createEnrollmentStore();
    store.upsert(parse(payload({ benefits_document_url: SOB_URL })));
    store.upsert(parse(payload({ updated_at: '2026-10-10T14:00:00Z' })));
    expect(store.all()[0].benefitsDocument.url).toBe(SOB_URL);
  });

  it('replaces the link when a newer payload sends a different URL', () => {
    const store = createEnrollmentStore();
    const newer = 'https://medicare.healthsherpa.com/documents/sob/v2.pdf';
    store.upsert(parse(payload({ benefits_document_url: SOB_URL })));
    store.upsert(
      parse(payload({ benefits_document_url: newer, updated_at: '2026-10-10T14:00:00Z' }))
    );
    expect(store.all()[0].benefitsDocument.url).toBe(newer);
  });

  it('ignores stale out-of-order deliveries', () => {
    const store = createEnrollmentStore();
    store.upsert(parse(payload({ plan_name: 'NEW', updated_at: '2026-10-10T14:00:00Z' })));
    const res = store.upsert(parse(payload({ plan_name: 'OLD', updated_at: '2026-10-10T10:00:00Z' })));
    expect(res.action).toBe('ignored_stale');
    expect(store.all()[0].planName).toBe('NEW');
  });

  it('does not merge equal confirmation numbers across different carriers', () => {
    const store = createEnrollmentStore();
    store.upsert(parse(payload({ id: 'a', carrier_name: 'EmblemHealth', confirmation_number: 'X1' })));
    store.upsert(parse(payload({ id: 'b', carrier_name: 'Banner Health', confirmation_number: 'X1' })));
    expect(store.all()).toHaveLength(2);
  });
});

function renderToHtml(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(element));
  const html = container.innerHTML;
  act(() => root.unmount());
  return html;
}

describe('BenefitsDocumentLink', () => {
  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('opens the HealthSherpa-hosted document in a new tab', () => {
    const html = renderToHtml(
      <BenefitsDocumentLink document={{ url: SOB_URL, label: 'Summary of Benefits' }} />
    );
    expect(html).toContain(`href="${SOB_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Summary of Benefits');
  });

  it.each([null, undefined, '', 'javascript:alert(1)', 'http://example.com/a.pdf'])( // eslint-disable-line no-script-url
    'renders no link for %p',
    (value) => {
      const html = renderToHtml(<BenefitsDocumentLink document={value} />);
      expect(html).not.toContain('href=');
      expect(html).toContain('Not available');
    }
  );
});

describe('BenefitsDocumentViewer', () => {
  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  const stored = {
    url: SOB_URL,
    label: 'Summary of Benefits',
    status: 'stored',
    viewUrl: '/api/enrollments/enr_1/benefits-document',
  };

  it('embeds the stored PDF in a dialog', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<BenefitsDocumentViewer document={stored} />));

    const button = container.querySelector('button');
    expect(button.textContent).toBe('Summary of Benefits');
    act(() => button.click());

    const embed = document.querySelector('object[type="application/pdf"]');
    expect(embed.getAttribute('data')).toBe(stored.viewUrl);
    act(() => root.unmount());
    container.remove();
  });

  it('falls back to the HealthSherpa link before the copy is stored', () => {
    const html = renderToHtml(<BenefitsDocumentViewer document={{ ...stored, status: undefined }} />);
    expect(html).toContain(`href="${SOB_URL}"`);
    expect(html).not.toContain('<object');
  });

  it('explains why the copy is missing after a failed download', () => {
    const html = renderToHtml(
      <BenefitsDocumentViewer
        document={{ url: SOB_URL, status: 'download_failed', failureReason: 'expired_or_missing' }}
      />
    );
    expect(html).toContain(`href="${SOB_URL}"`);
    expect(html).toContain('Copy not saved: link expired or not found');
  });

  it.each([
    ['/api/x.pdf', '/api/x.pdf'],
    ['https://agencyview.example.com/x.pdf', 'https://agencyview.example.com/x.pdf'],
    ['//evil.example.com/x.pdf', null],
    ['http://agencyview.example.com/x.pdf', null],
    ['javascript:alert(1)', null], // eslint-disable-line no-script-url
    ['', null],
    [undefined, null],
  ])('only embeds safe view URLs (%p)', (value, expected) => {
    expect(safeViewUrl(value)).toBe(expected);
  });
});
