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

    it('always sends payment-failed regardless of preferences', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(admin);
      (prefs.accepts as jest.Mock).mockResolvedValue(false);
      await service.sendPaymentFailedToCompany('co-1', 2500, 'usd', 2);
      expect(mail.sendMail).toHaveBeenCalled();
      expect(prefs.accepts).not.toHaveBeenCalled();
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
    });
  });
});
