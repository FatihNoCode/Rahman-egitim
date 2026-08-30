// Money, written the way the reader writes it.
//
// Every amount in the app was built as `€${n.toFixed(2)}`, which is the English
// convention: a decimal point and no space. A Dutch parent looking at their
// schoolgeld sees "€148.00" where their bank, their invoice and their own
// handwriting all say "€ 148,00" — and in Turkish it is "€148,00". A comma and
// a point are not interchangeable to someone who reads amounts for a living;
// the point reads as a thousands separator, so a bill briefly looks like it is
// off by a factor of a hundred.
//
// Intl does this correctly for both languages, including the thousands
// separator that toFixed never produced at all (€1250,00 -> € 1.250,00).

import type { Language } from '../app/App';

const cache = new Map<string, Intl.NumberFormat>();

function formatter(language: Language): Intl.NumberFormat {
  const locale = language === 'tr' ? 'tr-TR' : 'nl-NL';
  let f = cache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    cache.set(locale, f);
  }
  return f;
}

/**
 * An amount as euros in the reader's own notation.
 *
 * Accepts the strings the API hands back as well as numbers; anything that is
 * not a finite number formats as zero rather than "€ NaN", because a broken
 * amount on a payment screen is worse than a wrong one only in that nobody can
 * tell which it is.
 */
export function formatEuro(amount: number | string | null | undefined, language: Language): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return formatter(language).format(Number.isFinite(n) ? n : 0);
}
