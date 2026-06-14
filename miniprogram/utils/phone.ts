export function maskPhone(phone: string, fallback = ''): string {
  const value = String(phone || '').trim();
  if (!value) return fallback;
  if (value.length !== 11) return value;
  return `${value.slice(0, 3)}****${value.slice(7)}`;
}