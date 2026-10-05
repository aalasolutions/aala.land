import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../../shared/services/mail.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../../shared/enums/roles.enum';
import { EmailPreferencesService } from './email-preferences.service';
import { SystemEmailService } from './system-email.service';

describe('SystemEmailService', () => {
  let service: SystemEmailService;
  let mail: jest.Mocked<Pick<MailService, 'sendMail'>>;
  let prefs: jest.Mocked<
    Pick<EmailPreferencesService, 'accepts' | 'unsubscribeUrl'>
  >;
  let userRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;

  const admin = {
    id: 'admin-1',
    email: 'admin@acme.com',
    name: 'Admin',
  };

  beforeEach(async () => {
    process.env.APP_URL = 'https://app.aala.land';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemEmailService,
        {
          provide: MailService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EmailPreferencesService,
          useValue: {
            accepts: jest.fn().mockResolvedValue(true),
            unsubscribeUrl: jest
              .fn()
              .mockReturnValue('https://app.aala.land/u?token=x'),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SystemEmailService);
    mail = module.get(MailService);
    prefs = module.get(EmailPreferencesService);
    userRepo = module.get(getRepositoryToken(User));
  });

  describe('account emails', () => {
    it('sends welcome with both html and text', async () => {
      await service.sendWelcome({ email: 'a@b.com', name: 'Jane' }, 'Acme');
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('a@b.com');
      expect(arg.html).toContain('Welcome');
      expect(arg.html).toContain('Acme');
      expect(arg.text).toContain('Jane');
      expect(arg.html).toContain('https://app.aala.land');
    });

    it('sends a password reset with the reset link', async () => {
      await service.sendPasswordReset(
        { email: 'a@b.com', name: 'Jane' },
        'https://app.aala.land/reset-password?token=abc',
        60,
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.html).toContain('reset-password?token=abc');
      expect(arg.text).toContain('60 minutes');
    });

    it('tells an added member to get the password from the company admin', async () => {
      await service.sendMemberAdded(
        { email: 'a@b.com', name: 'Jane' },
        'AGENT',
        'Acme',
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('a@b.com');
      expect(arg.subject).toBe('You have been added to Acme on AALA.LAND');
      expect(arg.text).toContain('Contact them for it, then sign in.');
      expect(arg.html).toContain('https://app.aala.land/login');
    });

    it('escapes HTML in interpolated values', async () => {
      await service.sendWelcome(
        { email: 'a@b.com', name: '<script>x</script>' },
        'Acme',
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.html).not.toContain('<script>x</script>');
      expect(arg.html).toContain('&lt;script&gt;');
    });
  });

  describe('billing contact resolution', () => {
    it('prefers the company admin', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendPurchaseConfirmationToCompany('co-1', 'Pro', 3);
      expect(mail.sendMail.mock.calls[0][0].html).toContain(
        'https://app.aala.land/company?tab=billing',
      );
      expect(userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'co-1', role: Role.COMPANY_ADMIN, isActive: true },
        }),
      );
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@acme.com' }),
      );
    });

    it('falls back to any active user when there is no admin', async () => {
      (userRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'u2', email: 'u2@acme.com', name: 'U2' });
      await service.sendPurchaseConfirmationToCompany('co-1', 'Pro', 1);
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'u2@acme.com' }),
      );
    });

    it('sends nothing when the company has no reachable user', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);
      await service.sendPaymentFailedToCompany('co-1', 2500, 'usd', 1);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('preference gating', () => {
    it('skips the receipt when billing emails are muted', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(false);
      await service.sendPaymentSucceededToCompany('co-1', 2500, 'usd', null);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('sends the receipt when billing emails are allowed', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(true);
      await service.sendPaymentSucceededToCompany(
        'co-1',
        2500,
        'usd',
        'https://invoice',
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toContain('USD 25.00');
      expect(arg.html).toContain('https://invoice');
    });

    it('links the receipt to the billing tab when there is no invoice URL', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendPaymentSucceededToCompany('co-1', 2500, 'usd', null);
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });

    it('always sends payment-failed regardless of preferences', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValue(false);
      await service.sendPaymentFailedToCompany('co-1', 2500, 'usd', 2);
      expect(mail.sendMail).toHaveBeenCalled();
      expect(prefs.accepts).not.toHaveBeenCalled();
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });
  });

  describe('zero-charge credit notice', () => {
    it('states the invoice was paid from the credit balance', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendSettledWithoutChargeToCompany('co-1', 2498, 0, 'usd');
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('admin@acme.com');
      expect(arg.subject).toBe(
        'Invoice paid from your credit balance: USD 24.98',
      );
      expect(arg.text).toContain(
        'An invoice of USD 24.98 was paid in full from your account credit balance.',
      );
      expect(arg.text).toContain('Nothing was charged to your payment method.');
      expect(arg.text).not.toContain('future invoices');
    });

    it('states the credit issued will be used on future invoices', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendSettledWithoutChargeToCompany('co-1', 0, 2500, 'usd');
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toBe('Credit added to your balance: USD 25.00');
      expect(arg.text).toContain(
        'A change to your subscription added USD 25.00 to your account credit balance. It will be used on your future invoices.',
      );
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });

    it('skips when billing emails are muted', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(false);
      await service.sendSettledWithoutChargeToCompany('co-1', 2498, 0, 'usd');
      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('upcoming invoice', () => {
    it('sends a renewal reminder with a formatted date and amount', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(true);
      const sent = await service.sendUpcomingInvoiceToCompany(
        'co-1',
        new Date('2026-08-01T00:00:00Z'),
        7500,
        'usd',
      );
      expect(sent).toBe(true);
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toContain('August 1, 2026');
      expect(arg.html).toContain('USD 75.00');
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });

    it('formats the renewal date on its UTC calendar day', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(true);
      await service.sendUpcomingInvoiceToCompany(
        'co-1',
        new Date('2026-12-31T23:59:59Z'),
        null,
        null,
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toBe(
        'Your AALA.LAND subscription renews on December 31, 2026',
      );
    });

    it('skips when billing emails are muted', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValueOnce(false);
      const sent = await service.sendUpcomingInvoiceToCompany(
        'co-1',
        new Date('2026-08-01T00:00:00Z'),
        7500,
        'usd',
      );
      expect(sent).toBe(false);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('quota', () => {
    it('sends the storage quota email to the billing contact', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendQuotaExceededToCompany(
        'co-1',
        'storage',
        'You have used 2.00 GB of your 2.00 GB storage.',
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('admin@acme.com');
      expect(arg.html).toContain('storage');
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });
  });

  describe('downgrade and refund notices', () => {
    it('states when the plan ends, how to keep it, and to export data now', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendDowngradeRequestedToCompany(
        'co-1',
        new Date('2026-10-06T14:05:00Z'),
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('admin@acme.com');
      expect(arg.subject).toBe(
        'Your AALA.LAND plan ends on October 6, 2026 at 14:05 UTC',
      );
      expect(arg.text).toContain('Keep my plan');
      expect(arg.text).toContain('export any data');
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });

    it('states the refund amount and that it lands once the provider confirms', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendRefundRequestedToCompany('co-1', 1650, 'usd');
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toBe('Refund requested: USD 16.50');
      expect(arg.text).toContain('once the payment provider confirms it');
    });

    it('reports an approved, a rejected and a reversed refund', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(admin);
      await service.sendRefundSettledToCompany('co-1', 1650, 'usd', 'approved');
      await service.sendRefundSettledToCompany('co-1', 1650, 'usd', 'rejected');
      await service.sendRefundSettledToCompany('co-1', 1650, 'usd', 'reversed');
      expect(mail.sendMail.mock.calls[0][0].subject).toBe(
        'Refund approved: USD 16.50',
      );
      expect(mail.sendMail.mock.calls[1][0].subject).toBe(
        'Refund not approved: USD 16.50',
      );
      expect(mail.sendMail.mock.calls[2][0].subject).toBe(
        'Refund reversed: USD 16.50',
      );
      expect(mail.sendMail.mock.calls[2][0].text).toContain(
        'did not reach your payment method',
      );
    });

    it('says the request was cancelled, why, and that the plan keeps renewing', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendDowngradeCancelledToCompany(
        'co-1',
        'Your company has more than one active user again, and the Free plan allows one.',
      );
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toBe(
        'Your request to move to the Free plan was cancelled',
      );
      expect(arg.text).toContain('more than one active user again');
      expect(arg.text).toContain('continues and keeps renewing');
      expect(arg.html).toContain('https://app.aala.land/company?tab=billing');
    });

    it('says a failed refund could not be sent and asks for a reply, with the amount', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      await service.sendRefundFailedToCompany('co-1', 700, 'usd');
      const arg = mail.sendMail.mock.calls[0][0];
      expect(arg.subject).toBe(
        'Your refund of USD 7.00 could not be sent automatically',
      );
      expect(arg.text).toContain(
        'Your refund of USD 7.00 for the unused days could not be sent automatically.',
      );
      expect(arg.text).toContain(
        'Reply to this email and we will complete it.',
      );
      expect(arg.text).not.toContain('has been told');
    });

    it('formats amounts with the minor unit digits of each currency', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(admin);
      await service.sendRefundRequestedToCompany('co-1', 1650, 'usd');
      await service.sendRefundRequestedToCompany('co-1', 1650, 'jpy');
      await service.sendRefundRequestedToCompany('co-1', 1650, 'bhd');
      expect(mail.sendMail.mock.calls[0][0].subject).toBe(
        'Refund requested: USD 16.50',
      );
      expect(mail.sendMail.mock.calls[1][0].subject).toBe(
        'Refund requested: JPY 1650',
      );
      expect(mail.sendMail.mock.calls[2][0].subject).toBe(
        'Refund requested: BHD 1.650',
      );
    });

    it('sends the notices even when billing emails are muted', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(admin);
      (prefs.accepts as jest.Mock).mockResolvedValue(false);
      await service.sendRefundRequestedToCompany('co-1', 1650, 'usd');
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the company has no reachable user', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);
      await service.sendDowngradeRequestedToCompany('co-1', new Date());
      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });
});
