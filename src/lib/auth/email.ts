/**
 * Transactional email for the auth flows (magic-link sign-in, invitations).
 *
 * Reuses the existing `nodemailer` dependency. SMTP credentials are read from
 * env (SMTP_HOST/PORT/USER/PASS/FROM); when SMTP_HOST is unset we fall back to
 * logging the link to the dev console — useful for local development.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { EMAIL_FROM_DISPLAY, INVITATION_SUBJECT, MAGIC_LINK_SUBJECT } from "@/lib/branding/strings";

let cachedTransport: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

function fromHeader(): string {
  return process.env.SMTP_FROM ?? `${EMAIL_FROM_DISPLAY} <${process.env.SMTP_USER ?? "noreply@example.com"}>`;
}

function devFallback(prefix: string, email: string, link: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n[DEV MODE] ${prefix} for ${email}\n  ${link}\n`);
}

/**
 * Send a magic-link sign-in email. The link is a single-use, 15-minute token.
 */
export async function sendMagicLink(email: string, link: string): Promise<void> {
  if (!isSmtpConfigured()) {
    devFallback("magic link", email, link);
    return;
  }
  const transport = buildTransport();
  const html = `
    <p>Hi,</p>
    <p>Click the link below to sign in. The link is single-use and expires in 15 minutes.</p>
    <p><a href="${link}">Sign in</a></p>
    <p>If you didn't request this, you can ignore this email.</p>
  `;
  await transport.sendMail({
    from: fromHeader(),
    to: email,
    subject: MAGIC_LINK_SUBJECT,
    html,
    text: `Sign in: ${link}\n\n(Link expires in 15 minutes; if you didn't request it, ignore this email.)`,
  });
}

/**
 * Send an invitation email. Recipient clicks the link to accept and is signed in.
 */
export async function sendInvitation(email: string, leagueName: string, link: string): Promise<void> {
  if (!isSmtpConfigured()) {
    devFallback(`invitation to "${leagueName}"`, email, link);
    return;
  }
  const transport = buildTransport();
  const html = `
    <p>Hi,</p>
    <p>You've been invited to join the Fantasy Premier League league <strong>${escapeHtml(leagueName)}</strong>.</p>
    <p><a href="${link}">Accept the invitation</a></p>
    <p>This invitation link expires in 7 days.</p>
  `;
  await transport.sendMail({
    from: fromHeader(),
    to: email,
    subject: INVITATION_SUBJECT,
    html,
    text: `You've been invited to join the FPL league "${leagueName}".\nAccept here: ${link}\n\n(Invitation expires in 7 days.)`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
