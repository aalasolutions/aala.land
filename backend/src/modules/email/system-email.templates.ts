/**
 * Branded HTML for AALA.LAND system (account + billing) emails. These are the
 * product's own voice, fixed and not tenant-editable. CRM outreach templates
 * (company-editable, PRO gated) live in the email-templates module instead.
 *
 * All CSS is inline: email clients strip <style> and external sheets. The logo
 * is referenced by absolute URL off APP_URL (the frontend serves /logo.png).
 */

const BRAND = {
  teal: '#0f9d94',
  darkTeal: '#0d3b37',
  coral: '#f2635f',
  ink: '#1f2933',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f4f6f6',
};

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
}

export interface LayoutOptions {
  title: string;
  previewText: string;
  bodyHtml: string;
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Absolute URL for the one-click unsubscribe link. Omit for account emails. */
  unsubscribeUrl?: string;
}

/** Escape user-supplied values before interpolating into email HTML. */
export function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(label: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td align="center" bgcolor="${BRAND.teal}" style="border-radius: 8px;">
          <a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
             style="display: inline-block; padding: 13px 28px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Wraps content in the shared AALA.LAND shell (header logo + footer). */
export function renderLayout(opts: LayoutOptions): string {
  const logo = `${appUrl()}/logo.png`;
  const cta = opts.cta ? button(opts.cta.label, opts.cta.url) : '';
  const unsubscribe = opts.unsubscribeUrl
    ? `<p style="margin: 8px 0 0; font-size: 12px; color: ${BRAND.muted};">
         Don't want these emails?
         <a href="${esc(opts.unsubscribeUrl)}" style="color: ${BRAND.muted}; text-decoration: underline;">Unsubscribe</a>.
       </p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${BRAND.bg};">
<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${esc(opts.previewText)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: ${BRAND.bg}; padding: 24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background: #ffffff; border: 1px solid ${BRAND.border}; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 28px 32px 8px;">
            <img src="${logo}" width="44" height="44" alt="AALA.LAND" style="display: block; border: 0;">
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 32px 28px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: ${BRAND.ink}; font-size: 15px; line-height: 1.6;">
            <h1 style="margin: 0 0 12px; font-size: 21px; line-height: 1.3; color: ${BRAND.darkTeal};">${esc(opts.title)}</h1>
            ${opts.bodyHtml}
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 32px; border-top: 1px solid ${BRAND.border}; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <p style="margin: 0; font-size: 13px; color: ${BRAND.muted};">
              AALA.LAND &middot; Property management, simplified.
            </p>
            ${unsubscribe}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Plain paragraph helper for email body content. */
export function p(html: string): string {
  return `<p style="margin: 0 0 14px;">${html}</p>`;
}
