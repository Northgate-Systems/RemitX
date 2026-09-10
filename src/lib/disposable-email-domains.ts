/**
 * A curated set of common disposable/temporary email domains.
 *
 * This is intentionally a static, hand-maintained list rather than a live
 * lookup against a third-party API (no extra network dependency on the
 * registration hot path, no new failure mode if that API is down). It
 * won't catch every disposable provider that exists, but it blocks the
 * services that show up overwhelmingly often in spam-account reports.
 *
 * Matching is done against the domain only, case-insensitively, so
 * `Mailinator.COM` is treated the same as `mailinator.com`.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.biz",
  "guerrillamail.de",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "tempail.com",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.net",
  "yopmail.fr",
  "trashmail.com",
  "trash-mail.com",
  "getnada.com",
  "dispostable.com",
  "fakeinbox.com",
  "maildrop.cc",
  "mailnesia.com",
  "discard.email",
  "discardmail.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "emailondeck.com",
  "mailcatch.com",
  "mailnull.com",
  "spamgourmet.com",
  "spam4.me",
  "tempinbox.com",
  "tempr.email",
  "burnermail.io",
  "einrot.com",
  "fakemailgenerator.com",
  "mytemp.email",
  "mailtemp.top",
  "crazymailing.com",
]);

/**
 * Extracts the domain portion of an email address (lowercased) and checks
 * it against `DISPOSABLE_EMAIL_DOMAINS`. Returns `false` for malformed
 * input (no `@`) rather than throwing - actual format validation belongs
 * to the caller's `z.string().email()` check, this only cares about the
 * domain once the format is already known to be plausible.
 */
export function isDisposableEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) {
    return false;
  }
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
