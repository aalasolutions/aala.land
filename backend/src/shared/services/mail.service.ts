import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST) {
      this.smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE?.toLowerCase() === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
  }

  async sendMail(options: MailOptions): Promise<void> {
    const sendgridKey = process.env.SENDGRID_API_KEY;

    if (sendgridKey) {
      await this.sendViaSendGrid(options, sendgridKey);
    } else if (this.smtpTransporter) {
      await this.sendViaSmtp(options);
    } else {
      this.logger.warn('No email transport configured (SENDGRID_API_KEY or SMTP_HOST). Email not sent.');
    }
  }

  private async sendViaSendGrid(options: MailOptions, apiKey: string): Promise<void> {
    const from = process.env.SENDGRID_FROM_EMAIL || 'noreply@aala.land';

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: from },
          subject: options.subject,
          content: [
            { type: 'text/plain', value: options.text },
            ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      this.logger.log(`Email sent via SendGrid to ${options.to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SendGrid send failed for ${options.to}: ${message}`);
    }
  }

  private async sendViaSmtp(options: MailOptions): Promise<void> {
    try {
      await this.smtpTransporter!.sendMail({
        from: process.env.SMTP_FROM || 'noreply@aala.land',
        to: options.to,
        subject: options.subject,
        text: options.text,
        ...(options.html ? { html: options.html } : {}),
      });
      this.logger.log(`Email sent via SMTP to ${options.to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMTP send failed for ${options.to}: ${message}`);
    }
  }
}
