import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: any[]) => mockCreateTransport(...args),
}));

const originalFetch = global.fetch;

describe('MailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  describe('sendMail - SendGrid path', () => {
    let service: MailService;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.SMTP_HOST;
      process.env.SENDGRID_API_KEY = 'SG.test-key';
      process.env.SENDGRID_FROM_EMAIL = 'noreply@aala.land';

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('calls SendGrid API with correct payload', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => 'msg-id-123' },
      });

      await service.sendMail({
        to: 'user@example.com',
        subject: 'Welcome',
        text: 'Hello',
        html: '<p>Hello</p>',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer SG.test-key',
          }),
        }),
      );
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it('logs warning and does not throw when SendGrid returns error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Bad Request'),
      });

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await expect(service.sendMail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Body',
      })).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
    });
  });

  describe('sendMail - SMTP path', () => {
    let service: MailService;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.SENDGRID_API_KEY;
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'secret';
      process.env.SMTP_FROM = 'noreply@aala.land';

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('uses nodemailer when SendGrid key is absent', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'smtp-id' });

      await service.sendMail({
        to: 'user@example.com',
        subject: 'Welcome',
        text: 'Hello',
      });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' },
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@aala.land',
          to: 'user@example.com',
          subject: 'Welcome',
          text: 'Hello',
        }),
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not throw when SMTP fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await expect(service.sendMail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Body',
      })).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('user@example.com'));
    });
  });

  describe('sendMail - no transport configured', () => {
    let service: MailService;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      delete process.env.SENDGRID_API_KEY;
      delete process.env.SMTP_HOST;

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('logs warning and resolves without sending', async () => {
      await expect(service.sendMail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Body',
      })).resolves.not.toThrow();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });
  });
});
