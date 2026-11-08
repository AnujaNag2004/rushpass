import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

let transporterPromise: Promise<Transporter> | null = null;

/** Uses real SMTP when configured, otherwise a throwaway Ethereal inbox (preview URL is logged). */
function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (config.SMTP_HOST) {
        return nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT ?? 587,
          secure: (config.SMTP_PORT ?? 587) === 465,
          auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
        });
      }
      const account = await nodemailer.createTestAccount();
      logger.info({ user: account.user }, '📧 Using Ethereal test inbox for emails');
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    })();
    transporterPromise.catch(() => {
      transporterPromise = null;
    });
  }
  return transporterPromise;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export async function sendMail(input: MailInput) {
  if (config.isTest) return;
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from: config.MAIL_FROM, ...input });
  const preview = nodemailer.getTestMessageUrl(info);
  logger.info({ to: input.to, subject: input.subject, preview: preview || undefined }, 'email sent');
}

export function emailLayout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0B0A14;font-family:Inter,Arial,sans-serif;color:#F4F2FF">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#15131F;border:1px solid #2A2640;border-radius:16px;overflow:hidden">
  <tr><td style="height:6px;background:linear-gradient(135deg,#7C5CFF 0%,#FF4D8D 55%,#FFB547 100%)"></td></tr>
  <tr><td style="padding:28px 32px">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em">Rush<span style="color:#FF4D8D">Pass</span></div>
    <h1 style="font-size:20px;margin:20px 0 8px">${title}</h1>
    <div style="color:#9A94B8;font-size:14px;line-height:1.6">${body}</div>
  </td></tr></table>
  <p style="color:#9A94B8;font-size:12px;margin-top:16px">Get in before the rush.</p>
  </td></tr></table></body></html>`;
}
