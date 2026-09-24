/**
 * Reusable external-contact service (WhatsApp / Viber).
 * Numbers come from the central app settings row — never hard-code them in UI.
 */

export type ContactSettings = {
  company_name: string | null;
  whatsapp_number: string | null;
  viber_number: string | null;
  contact_email: string | null;
  address: string | null;
};

const digits = (value: string) => value.replace(/[^\d]/g, "");

export const isValidPhone = (value?: string | null) => !!value && digits(value).length >= 7;

export function whatsappLink(number?: string | null, message?: string) {
  if (!isValidPhone(number)) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits(number!)}${text}`;
}

export function viberLink(number?: string | null) {
  if (!isValidPhone(number)) return null;
  return `viber://chat?number=%2B${digits(number!)}`;
}

export const telLink = (number?: string | null) =>
  isValidPhone(number) ? `tel:+${digits(number!)}` : null;
