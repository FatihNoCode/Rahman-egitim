/**
 * "Which day is it here?" — in the school's own timezone, not UTC.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious way to write today as
 * a YYYY-MM-DD, and it is wrong for everyone in the Netherlands between
 * midnight and 01:00 (02:00 in summer): the UTC clock still says yesterday, so
 * a teacher opening the app late on Saturday night gets Friday's date on the
 * attendance form, and a week window computed that way starts and ends a day
 * early — dropping the school's Sunday lessons out of "this week" entirely.
 *
 * These format the *local* calendar day instead, which is the only day any of
 * these screens ever means.
 */

/** A Date as YYYY-MM-DD in the viewer's own timezone. */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today, as YYYY-MM-DD in the viewer's own timezone. */
export function localDay(): string {
  return toLocalYmd(new Date());
}
