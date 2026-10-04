import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../shared/services/mail.service';
import { envString } from '@shared/utils/env.util';
import { User } from '../users/entities/user.entity';
import { Role } from '../../shared/enums/roles.enum';
import { EmailPreferencesService } from './email-preferences.service';
import {
  downgradeCancelledEmail,
  downgradeRequestedEmail,
  inviteEmail,
  passwordResetEmail,
  paymentFailedEmail,
  paymentSucceededEmail,
  purchaseConfirmationEmail,
  quotaExceededEmail,
  refundFailedEmail,
  refundRequestedEmail,
  refundSettledEmail,
  RenderedEmail,
  settledWithoutChargeEmail,
  upcomingInvoiceEmail,
  welcomeEmail,
} from './system-email.content';

/** Minimal recipient shape the senders need. */
export interface EmailRecipient {
  id: string;
  email: string;
  name: string;
}

/** Billing tab of the company page. */
const BILLING_PAGE_PATH = '/company?tab=billing';

function appUrl(): string {
  return envString('APP_URL', 'http://localhost:4200').replace(/\/$/, '');
}

function billingPageUrl(): string {
  return `${appUrl()}${BILLING_PAGE_PATH}`;
}

// Account emails take explicit {email, name}; company emails resolve contact from companyId.
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

  // The company admin is the billing/notification contact, with the oldest active user as fallback.
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
        upgradeUrl: billingPageUrl(),
      }),
    );
  }

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
        billingUrl: billingPageUrl(),
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
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(recipient.id, 'billing'),
      }),
    );
  }

  /** Zero-charge notice. Suppressible (billing). */
  async sendSettledWithoutChargeToCompany(
    companyId: string,
    creditAppliedMinor: number,
    creditIssuedMinor: number,
    currency: string,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    if (!(await this.preferences.accepts(recipient.id, 'billing'))) {
      this.logger.debug(
        `Skipping credit notice for ${recipient.email}: billing emails muted`,
      );
      return;
    }
    await this.send(
      recipient.email,
      settledWithoutChargeEmail({
        name: recipient.name,
        creditAppliedMinor,
        creditIssuedMinor,
        currency,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
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
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(recipient.id, 'billing'),
      }),
    );
    return true;
  }

  /** Always sent. */
  async sendDowngradeRequestedToCompany(
    companyId: string,
    effectiveAt: Date,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      downgradeRequestedEmail({
        name: recipient.name,
        effectiveAt,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
      }),
    );
  }

  /** Always sent. */
  async sendRefundRequestedToCompany(
    companyId: string,
    amountMinor: number,
    currency: string,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      refundRequestedEmail({
        name: recipient.name,
        amountMinor,
        currency,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
      }),
    );
  }

  /** Always sent. */
  async sendRefundSettledToCompany(
    companyId: string,
    amountMinor: number,
    currency: string,
    outcome: 'approved' | 'rejected' | 'reversed',
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      refundSettledEmail({
        name: recipient.name,
        amountMinor,
        currency,
        outcome,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
      }),
    );
  }

  /** Always sent. */
  async sendRefundFailedToCompany(
    companyId: string,
    amountMinor: number,
    currency: string,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      refundFailedEmail({
        name: recipient.name,
        amountMinor,
        currency,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
      }),
    );
  }

  /** Always sent. */
  async sendDowngradeCancelledToCompany(
    companyId: string,
    reason: string,
  ): Promise<void> {
    const recipient = await this.billingContact(companyId);
    if (!recipient) return;
    await this.send(
      recipient.email,
      downgradeCancelledEmail({
        name: recipient.name,
        reason,
        billingUrl: billingPageUrl(),
        unsubscribeUrl: this.preferences.unsubscribeUrl(
          recipient.id,
          'billing',
        ),
      }),
    );
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
        billingUrl: billingPageUrl(),
      }),
    );
  }
}
