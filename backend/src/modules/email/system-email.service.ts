import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../shared/services/mail.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../../shared/enums/roles.enum';
import { EmailPreferencesService } from './email-preferences.service';
import {
  inviteEmail,
  passwordResetEmail,
  paymentFailedEmail,
  paymentSucceededEmail,
  purchaseConfirmationEmail,
  quotaExceededEmail,
  RenderedEmail,
  upcomingInvoiceEmail,
  welcomeEmail,
} from './system-email.content';

/** Minimal recipient shape the senders need. */
export interface EmailRecipient {
  id: string;
  email: string;
  name: string;
}

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
}

/**
 * Sends AALA.LAND's own account + billing emails. Every message is built from a
 * default content template (system-email.content.ts) wrapped in the single shared
 * shell (system-email.templates.ts). Account emails always send; suppressible
 * categories check the recipient's preferences and carry an unsubscribe footer.
 *
 * Two entry shapes: account emails take an explicit {email, name} (the caller
 * has the user), while company-level emails (billing, quota) resolve the
 * company's billing contact here so callers need only a companyId.
 */
@Injectable()
export class SystemEmailService {
  private readonly logger = new Logger(SystemEmailService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly preferences: EmailPreferencesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private async send(to: string, email: RenderedEmail): Promise<void> {
    await this.mailService.sendMail({
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }

  /** The company admin is the billing/notification contact; oldest active user
   *  is the fallback. Returns null if the company has no reachable user. */
  private async billingContact(
    companyId: string,
  ): Promise<EmailRecipient | null> {
    const admin = await this.userRepo.findOne({
      where: { companyId, role: Role.COMPANY_ADMIN, isActive: true },
      select: ['id', 'email', 'name'],
      order: { createdAt: 'ASC' },
    });
    const user =
      admin ??
      (await this.userRepo.findOne({
        where: { companyId, isActive: true },
        select: ['id', 'email', 'name'],
        order: { createdAt: 'ASC' },
      }));
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  }

  // ---- Account emails (always send) --------------------------------------

  async sendWelcome(
    recipient: { email: string; name: string },
    companyName: string,
  ): Promise<void> {
    await this.send(
      recipient.email,
      welcomeEmail({
        name: recipient.name,
        companyName,
        loginUrl: `${appUrl()}/login`,
      }),
    );
  }

  async sendPasswordReset(
    recipient: { email: string; name: string },
    resetUrl: string,
    expiresMinutes: number,
  ): Promise<void> {
    await this.send(
      recipient.email,
      passwordResetEmail({ name: recipient.name, resetUrl, expiresMinutes }),
    );
  }

  async sendInvite(
    recipient: { email: string; name: string },
    role: string,
    companyName: string,
    inviteUrl: string,
  ): Promise<void> {
    await this.send(
      recipient.email,
      inviteEmail({
        name: recipient.name,
        role,
        companyName,
        inviteUrl,
      }),
    );
  }

  /** Storage/resource limit hit. Sent to the company billing contact. */
  async sendQuotaExceededToCompany(
    companyId: string,
    resourceLabel: string,
    detail: string,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      quotaExceededEmail({
        name: recipient.name,
        resourceLabel,
        detail,
        upgradeUrl: `${appUrl()}/settings/billing`,
      }),
    );
  }

  // ---- Billing emails (resolve the company billing contact) --------------

  async sendPurchaseConfirmationToCompany(
    companyId: string,
    planLabel: string,
    seats: number,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    // Confirmation of an action the user just took; always send.
    await this.send(
      recipient.email,
      purchaseConfirmationEmail({
        name: recipient.name,
        planLabel,
        seats,
        billingUrl: `${appUrl()}/settings/billing`,
        unsubscribeUrl: this.preferences.unsubscribeUrl(recipient.id, 'billing'),
      }),
    );
  }

  async sendPaymentSucceededToCompany(
    companyId: string,
    amountMinor: number,
    currency: string,
    invoiceUrl: string | null,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    // Receipt is suppressible: skip if the recipient muted billing emails.
    if (!(await this.preferences.accepts(recipient.id, 'billing'))) {
      this.logger.debug(
        `Skipping payment receipt for ${recipient.email}: billing emails muted`,
      );
      return;
    }
    await this.send(
      recipient.email,
      paymentSucceededEmail({
        name: recipient.name,
        amountMinor,
        currency,
        invoiceUrl,
        billingUrl: `${appUrl()}/settings/billing`,
        unsubscribeUrl: this.preferences.unsubscribeUrl(recipient.id, 'billing'),
      }),
    );
  }

  /** Upcoming-renewal reminder from the daily cron. Suppressible (billing). */
  async sendUpcomingInvoiceToCompany(
    companyId: string,
    renewalDate: Date,
    amountMinor: number | null,
    currency: string | null,
  ): Promise<boolean> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return false;
    if (!(await this.preferences.accepts(recipient.id, 'billing'))) {
      this.logger.debug(
        `Skipping renewal reminder for ${recipient.email}: billing emails muted`,
      );
      return false;
    }
    await this.send(
      recipient.email,
      upcomingInvoiceEmail({
        name: recipient.name,
        renewalDate,
        amountMinor,
        currency,
        billingUrl: `${appUrl()}/settings/billing`,
        unsubscribeUrl: this.preferences.unsubscribeUrl(recipient.id, 'billing'),
      }),
    );
    return true;
  }

  async sendPaymentFailedToCompany(
    companyId: string,
    amountMinor: number,
    currency: string,
    attemptCount: number | null,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    // Critical: a failed payment always sends, regardless of preferences.
    await this.send(
      recipient.email,
      paymentFailedEmail({
        name: recipient.name,
        amountMinor,
        currency,
        attemptCount,
        billingUrl: `${appUrl()}/settings/billing`,
      }),
    );
  }
}
