// Builds vCard 3.0 (.vcf) files entirely in the browser.
// vCard 3.0 is the most widely supported version (iPhone, Android, Outlook, Gmail).

export const EMPTY_CARD = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  nickname: '',
  organization: '',
  jobTitle: '',
  website: '',
  email: '',
  phone: '',
  email2: '',
  phone2: '',
  birthday: '',
  anniversary: '',
  // Data URL (data:image/jpeg;base64,...) shown on the recipient's phone when you call.
  photo: '',
};

// Escape characters that have special meaning in vCard text values.
export const escapeValue = (value = '') =>
  String(value)
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

// Lines longer than 75 octets must be folded (RFC 2426 / RFC 6350).
export const foldLine = (line) => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    parts.push(' ' + line.slice(i, i + 74));
  }
  return parts.join('\r\n');
};

export const normalizeUrl = (url = '') => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const fullName = (card) =>
  [card.firstName, card.middleName, card.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ') + (card.suffix && card.suffix.trim() ? `, ${card.suffix.trim()}` : '');

export const validateCard = (card) => {
  const errors = {};
  if (!card.firstName.trim()) errors.firstName = 'First name is required';
  if (!card.lastName.trim()) errors.lastName = 'Last name is required';
  if (!card.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email.trim())) {
    errors.email = 'Enter a valid email';
  }
  if (card.email2.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email2.trim())) {
    errors.email2 = 'Enter a valid email';
  }
  if (!card.phone.trim()) errors.phone = 'Phone number is required';
  return errors;
};

const PHOTO_DATA_URL = /^data:image\/(jpeg|jpg|png|gif);base64,([A-Za-z0-9+/=]+)$/i;

// Returns the vCard PHOTO line for a data URL, or null if there is no usable photo.
export const photoLine = (photo, { truncate = false } = {}) => {
  const match = PHOTO_DATA_URL.exec(photo || '');
  if (!match) return null;
  const type = match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase();
  const data = truncate
    ? `${match[2].slice(0, 24)}… (${Math.round((match[2].length * 3) / 4 / 1024)} KB photo)`
    : match[2];
  return `PHOTO;ENCODING=b;TYPE=${type}:${data}`;
};

// Pass { truncatePhoto: true } for an on-screen preview that doesn't print the whole image.
export const buildVCard = (card, { truncatePhoto = false } = {}) => {
  const c = { ...EMPTY_CARD, ...card };
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${[c.lastName, c.firstName, c.middleName, '', c.suffix].map(escapeValue).join(';')}`,
    `FN:${escapeValue(fullName(c))}`,
  ];

  if (c.nickname.trim()) lines.push(`NICKNAME:${escapeValue(c.nickname)}`);
  if (c.organization.trim()) lines.push(`ORG:${escapeValue(c.organization)}`);
  if (c.jobTitle.trim()) lines.push(`TITLE:${escapeValue(c.jobTitle)}`);
  if (c.email.trim()) lines.push(`EMAIL;TYPE=INTERNET,WORK,PREF:${escapeValue(c.email)}`);
  if (c.email2.trim()) lines.push(`EMAIL;TYPE=INTERNET,HOME:${escapeValue(c.email2)}`);
  if (c.phone.trim()) lines.push(`TEL;TYPE=WORK,VOICE,PREF:${escapeValue(c.phone)}`);
  if (c.phone2.trim()) lines.push(`TEL;TYPE=CELL:${escapeValue(c.phone2)}`);
  if (c.website.trim()) lines.push(`URL;TYPE=WORK:${normalizeUrl(c.website)}`);
  if (c.birthday) lines.push(`BDAY:${c.birthday}`);
  if (c.anniversary) {
    // Apple and Android both understand X-ANNIVERSARY; iOS also reads the labeled X-ABDATE.
    lines.push(`X-ANNIVERSARY:${c.anniversary}`);
    lines.push(`item1.X-ABDATE:${c.anniversary}`);
    lines.push('item1.X-ABLabel:_$!<Anniversary>!$_');
  }
  const photo = photoLine(c.photo, { truncate: truncatePhoto });
  if (photo) lines.push(photo);
  lines.push(`REV:${new Date().toISOString().replace(/\.\d{3}/, '')}`);
  lines.push('END:VCARD');

  return lines.map(foldLine).join('\r\n') + '\r\n';
};

export const vcardFileName = (card) => {
  const base = [card.firstName, card.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9-]/gi, '');
  return `${base || 'contact'}.vcf`;
};

export const downloadVCard = (card) => {
  const blob = new Blob([buildVCard(card)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = vcardFileName(card);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
