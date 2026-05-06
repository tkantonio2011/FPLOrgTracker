import nodemailer from "nodemailer";

export function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export async function sendDigestEmail(subject: string, html: string, recipients: string[]): Promise<void> {
  if (recipients.length === 0) throw new Error("No recipient email addresses configured. Add emails to members in the Admin page.");

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: parseInt(process.env.SMTP_PORT ?? "587") === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
  await transport.sendMail({
    from,
    to: from,
    bcc: recipients,
    subject,
    html,
  });
}
