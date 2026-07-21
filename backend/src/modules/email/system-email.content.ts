/**
 * Default content for each system email. One function per email = one overridable
 * unit. Every function routes its body through renderLayout (the single shared
 * header/footer shell), so a footer change in system-email.templates.ts
 * propagates to all of them at once.
 *
 * Each builder returns { subject, html, text }. The text fallback exists because
 * MailService always sends a text/plain part alongside the HTML.
 */
import { renderLayout, esc, p } from './system-email.templates';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function money(amountMinor: number, currency: string): string {
  const major = (amountMinor / 100).toFixed(2);
  return `${currency.toUpperCase()} ${major}`;
}

// ---- Account emails (never suppressed) -----------------------------------

export function welcomeEmail(vars: {
  name: string;
  companyName: string;
  loginUrl: string;
}): RenderedEmail {
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `Welcome to AALA.LAND. Your workspace for <strong>${esc(vars.companyName)}</strong> is ready.`,
    ) +
    p(
      `Add your properties, track leads on the Kanban board, and manage your team from one place.`,
    );
  return {
    subject: `Welcome to AALA.LAND, ${vars.name}`,
    html: renderLayout({
      title: 'Welcome to AALA.LAND',
      previewText: `Your workspace for ${vars.companyName} is ready.`,
      bodyHtml: body,
      cta: { label: 'Open your dashboard', url: vars.loginUrl },
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `Welcome to AALA.LAND. Your workspace for ${vars.companyName} is ready.`,
      ``,
      `Open your dashboard: ${vars.loginUrl}`,
    ].join('\n'),
  };
}

export function passwordResetEmail(vars: {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): RenderedEmail {
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `We received a request to reset your AALA.LAND password. Click the button below to choose a new one.`,
    ) +
    p(
      `This link expires in ${vars.expiresMinutes} minutes. If you did not request this, you can safely ignore this email.`,
    );
  return {
    subject: 'Reset your AALA.LAND password',
    html: renderLayout({
      title: 'Reset your password',
      previewText: 'Choose a new password for your AALA.LAND account.',
      bodyHtml: body,
      cta: { label: 'Reset password', url: vars.resetUrl },
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `Reset your AALA.LAND password using the link below:`,
      vars.resetUrl,
      ``,
      `This link expires in ${vars.expiresMinutes} minutes. If you did not request this, ignore this email.`,
    ].join('\n'),
  };
}

export function inviteEmail(vars: {
  name: string;
  role: string;
  companyName: string;
  inviteUrl: string;
}): RenderedEmail {
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `You have been invited to join <strong>${esc(vars.companyName)}</strong> on AALA.LAND as ${esc(vars.role)}.`,
    ) +
    p(`Set your password to activate your account. This link expires in 72 hours.`);
  return {
    subject: `You have been invited to ${vars.companyName} on AALA.LAND`,
    html: renderLayout({
      title: 'You have been invited',
      previewText: `Join ${vars.companyName} on AALA.LAND.`,
      bodyHtml: body,
      cta: { label: 'Activate your account', url: vars.inviteUrl },
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `You have been invited to join ${vars.companyName} on AALA.LAND as ${vars.role}.`,
      ``,
      `Activate your account: ${vars.inviteUrl}`,
      ``,
      `This link expires in 72 hours.`,
    ].join('\n'),
  };
}

export function quotaExceededEmail(vars: {
  name: string;
  resourceLabel: string;
  detail: string;
  upgradeUrl: string;
}): RenderedEmail {
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `Your account has reached its <strong>${esc(vars.resourceLabel)}</strong> limit.`,
    ) +
    p(esc(vars.detail)) +
    p(`Upgrade your plan or add a seat to keep going.`);
  return {
    subject: `You have reached your ${vars.resourceLabel} limit`,
    html: renderLayout({
      title: `${vars.resourceLabel} limit reached`,
      previewText: `Upgrade to increase your ${vars.resourceLabel}.`,
      bodyHtml: body,
      cta: { label: 'Upgrade your plan', url: vars.upgradeUrl },
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `Your account has reached its ${vars.resourceLabel} limit.`,
      vars.detail,
      ``,
      `Upgrade your plan: ${vars.upgradeUrl}`,
    ].join('\n'),
  };
}

// ---- Billing emails -------------------------------------------------------

export function purchaseConfirmationEmail(vars: {
  name: string;
  planLabel: string;
  seats: number;
  billingUrl: string;
  unsubscribeUrl?: string;
}): RenderedEmail {
  const seatLine =
    vars.seats > 0
      ? p(`Seats: <strong>${vars.seats}</strong>`)
      : '';
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(`Your subscription is active. Thank you for choosing AALA.LAND.`) +
    p(`Plan: <strong>${esc(vars.planLabel)}</strong>`) +
    seatLine;
  return {
    subject: `Your AALA.LAND ${vars.planLabel} subscription is active`,
    html: renderLayout({
      title: 'Your subscription is active',
      previewText: `Your ${vars.planLabel} plan is now active.`,
      bodyHtml: body,
      cta: { label: 'View billing', url: vars.billingUrl },
      unsubscribeUrl: vars.unsubscribeUrl,
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `Your AALA.LAND subscription is active.`,
      `Plan: ${vars.planLabel}`,
      vars.seats > 0 ? `Seats: ${vars.seats}` : '',
      ``,
      `View billing: ${vars.billingUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format a date as "August 20, 2026" in UTC (no locale/timezone surprises). */
function formatRenewalDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function upcomingInvoiceEmail(vars: {
  name: string;
  renewalDate: Date;
  amountMinor: number | null;
  currency: string | null;
  billingUrl: string;
  unsubscribeUrl?: string;
}): RenderedEmail {
  const when = formatRenewalDate(vars.renewalDate);
  const amountLine =
    vars.amountMinor != null && vars.currency
      ? p(
          `Expected charge: <strong>${money(vars.amountMinor, vars.currency)}</strong>`,
        )
      : '';
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `This is a reminder that your AALA.LAND subscription renews on <strong>${when}</strong>.`,
    ) +
    amountLine +
    p(`No action is needed if your payment details are up to date.`);
  return {
    subject: `Your AALA.LAND subscription renews on ${when}`,
    html: renderLayout({
      title: 'Your subscription renews soon',
      previewText: `Your plan renews on ${when}.`,
      bodyHtml: body,
      cta: { label: 'Manage billing', url: vars.billingUrl },
      unsubscribeUrl: vars.unsubscribeUrl,
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `Your AALA.LAND subscription renews on ${when}.`,
      vars.amountMinor != null && vars.currency
        ? `Expected charge: ${money(vars.amountMinor, vars.currency)}`
        : '',
      ``,
      `Manage billing: ${vars.billingUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function paymentSucceededEmail(vars: {
  name: string;
  amountMinor: number;
  currency: string;
  invoiceUrl: string | null;
  billingUrl: string;
  unsubscribeUrl?: string;
}): RenderedEmail {
  const amount = money(vars.amountMinor, vars.currency);
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(`We received your payment of <strong>${amount}</strong>. Thank you.`) +
    p(`A receipt is available from your billing page.`);
  return {
    subject: `Payment received: ${amount}`,
    html: renderLayout({
      title: 'Payment received',
      previewText: `We received your payment of ${amount}.`,
      bodyHtml: body,
      cta: {
        label: vars.invoiceUrl ? 'View invoice' : 'View billing',
        url: vars.invoiceUrl || vars.billingUrl,
      },
      unsubscribeUrl: vars.unsubscribeUrl,
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `We received your payment of ${amount}. Thank you.`,
      ``,
      `Invoice: ${vars.invoiceUrl || vars.billingUrl}`,
    ].join('\n'),
  };
}

export function paymentFailedEmail(vars: {
  name: string;
  amountMinor: number;
  currency: string;
  attemptCount: number | null;
  billingUrl: string;
}): RenderedEmail {
  const amount = money(vars.amountMinor, vars.currency);
  const attemptLine =
    vars.attemptCount && vars.attemptCount > 1
      ? p(`This was attempt ${vars.attemptCount}.`)
      : '';
  const body =
    p(`Hi ${esc(vars.name)},`) +
    p(
      `We could not process your payment of <strong>${amount}</strong>. Your account is now past due.`,
    ) +
    attemptLine +
    p(`Update your payment method to avoid losing access to your plan.`);
  return {
    subject: `Action needed: payment failed (${amount})`,
    html: renderLayout({
      title: 'Payment failed',
      previewText: `We could not process your payment of ${amount}.`,
      bodyHtml: body,
      cta: { label: 'Update payment method', url: vars.billingUrl },
    }),
    text: [
      `Hi ${vars.name},`,
      ``,
      `We could not process your payment of ${amount}. Your account is now past due.`,
      `Update your payment method: ${vars.billingUrl}`,
    ].join('\n'),
  };
}
