// Display helpers shared by admin views and exports.

// "$1 250.50": thousands are split by a thin space, never a comma (the shop's style).
export function formatMoney(cents, currency = 'USD') {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en', {
    style: 'currency', currency, maximumFractionDigits: currency === 'LBP' ? 0 : 2,
  }).format(cents / 100).replace(/,/g, ' ');
}

// "48.5" for a form input, from 4850 cents.
export function centsToInput(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  const value = Number(cents) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Beirut',
});

export function formatDate(iso) {
  return iso ? DATE_FORMAT.format(new Date(iso)) : '—';
}

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
}

// Customers type numbers however they like. WhatsApp links need digits with a country code.
// Lebanese local numbers (03 123 456, 70 123 456) get +961.
export function whatsAppDigits(phone, defaultCountryCode = '961') {
  const trimmed = String(phone).trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode) && digits.length > 9) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `${defaultCountryCode}${digits}`;
}
