import { buildVCard, escapeValue, foldLine, validateCard, vcardFileName, EMPTY_CARD } from './vcard';

const card = {
  ...EMPTY_CARD,
  firstName: 'Jane',
  middleName: 'Q',
  lastName: 'Agent',
  suffix: 'Jr.',
  organization: 'Acme Insurance, LLC',
  jobTitle: 'Licensed Agent',
  website: 'acme.example.com',
  email: 'jane@acme.example.com',
  phone: '555-123-4567',
  phone2: '555-987-6543',
  birthday: '1985-04-12',
  anniversary: '2010-06-20',
};

test('builds a vCard 3.0 with all populated fields', () => {
  const vcf = buildVCard(card);
  const lines = vcf.split('\r\n');
  expect(lines[0]).toBe('BEGIN:VCARD');
  expect(lines).toContain('VERSION:3.0');
  expect(lines).toContain('N:Agent;Jane;Q;;Jr.');
  expect(lines).toContain('FN:Jane Q Agent\\, Jr.');
  expect(lines).toContain('ORG:Acme Insurance\\, LLC');
  expect(lines).toContain('TEL;TYPE=CELL:555-987-6543');
  expect(lines).toContain('URL;TYPE=WORK:https://acme.example.com');
  expect(lines).toContain('BDAY:1985-04-12');
  expect(lines).toContain('X-ANNIVERSARY:2010-06-20');
  expect(vcf.endsWith('END:VCARD\r\n')).toBe(true);
});

test('omits empty optional fields', () => {
  const vcf = buildVCard({ ...EMPTY_CARD, firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '1' });
  expect(vcf).not.toMatch(/NICKNAME|ORG|TITLE|URL|BDAY|ANNIVERSARY|TYPE=CELL|TYPE=INTERNET,HOME/);
});

test('escapes special characters and folds long lines', () => {
  expect(escapeValue('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  const folded = foldLine('X'.repeat(160)).split('\r\n');
  expect(folded[0]).toHaveLength(75);
  expect(folded.slice(1).every((l) => l.startsWith(' ') && l.length <= 75)).toBe(true);
});

test('validates required fields and email format', () => {
  expect(validateCard(card)).toEqual({});
  const errors = validateCard({ ...EMPTY_CARD, email: 'bad', email2: 'also bad' });
  expect(Object.keys(errors).sort()).toEqual(['email', 'email2', 'firstName', 'lastName', 'phone']);
});

test('creates a safe file name', () => {
  expect(vcardFileName(card)).toBe('Jane-Agent.vcf');
  expect(vcardFileName(EMPTY_CARD)).toBe('contact.vcf');
});

test('embeds a contact photo as base64 and folds it', () => {
  const data = 'A'.repeat(300);
  const vcf = buildVCard({ ...card, photo: `data:image/jpeg;base64,${data}` });
  const unfolded = vcf.replace(/\r\n /g, '');
  expect(unfolded).toContain(`PHOTO;ENCODING=b;TYPE=JPEG:${data}\r\n`);
  expect(vcf.split('\r\n').every((line) => line.length <= 75)).toBe(true);
});

test('truncates the photo in previews and ignores invalid photos', () => {
  const photo = `data:image/png;base64,${'B'.repeat(4000)}`;
  expect(buildVCard({ ...card, photo }, { truncatePhoto: true })).toMatch(/PHOTO;ENCODING=b;TYPE=PNG:B{24}… \(3 KB photo\)/);
  expect(buildVCard({ ...card, photo: 'not-a-data-url' })).not.toContain('PHOTO');
});
