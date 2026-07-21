import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailPreferencesController } from './email-preferences.controller';
import { EmailPreferencesService } from './email-preferences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('EmailPreferencesController', () => {
  let controller: EmailPreferencesController;
  let service: jest.Mocked<
    Pick<
      EmailPreferencesService,
      'verifyToken' | 'getByUserId' | 'update' | 'unsubscribeByToken'
    >
  >;

  const prefs = { billing: true, productUpdates: true, statsDigest: true };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailPreferencesController],
      providers: [
        {
          provide: EmailPreferencesService,
          useValue: {
            verifyToken: jest.fn(),
            getByUserId: jest.fn(),
            update: jest.fn(),
            unsubscribeByToken: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(EmailPreferencesController);
    service = module.get(EmailPreferencesService);
  });

  describe('resolve', () => {
    it('returns valid:false for a bad token', async () => {
      service.verifyToken.mockReturnValue(null);
      expect(await controller.resolve('bad')).toEqual({ valid: false });
    });

    it('returns preferences for a valid token', async () => {
      service.verifyToken.mockReturnValue('u1');
      service.getByUserId.mockResolvedValue(prefs);
      expect(await controller.resolve('good')).toEqual({
        valid: true,
        preferences: prefs,
      });
    });

    it('returns valid:false when the token user was deleted', async () => {
      service.verifyToken.mockReturnValue('u1');
      service.getByUserId.mockRejectedValue(new NotFoundException());
      expect(await controller.resolve('good')).toEqual({ valid: false });
    });
  });

  describe('updateByToken', () => {
    it('returns valid:false when the token user was deleted', async () => {
      service.verifyToken.mockReturnValue('u1');
      service.update.mockRejectedValue(new NotFoundException());
      expect(await controller.updateByToken('good', { billing: false })).toEqual(
        { valid: false },
      );
    });
  });

  describe('unsubscribe', () => {
    it('maps a deleted-user NotFound to a 400 invalid-link', async () => {
      service.unsubscribeByToken.mockRejectedValue(new NotFoundException());
      await expect(
        controller.unsubscribe('good', 'billing'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
