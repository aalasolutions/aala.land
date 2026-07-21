import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { EmailPreferencesService } from './email-preferences.service';
import { User } from '../users/entities/user.entity';

describe('EmailPreferencesService', () => {
  let service: EmailPreferencesService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'update'>>;

  const userId = 'user-uuid-1';

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailPreferencesService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    }).compile();

    service = module.get(EmailPreferencesService);
    repo = module.get(getRepositoryToken(User));
  });

  describe('token', () => {
    it('round-trips a valid token back to the userId', () => {
      const token = service.signToken(userId);
      expect(service.verifyToken(token)).toBe(userId);
    });

    it('rejects a tampered signature', () => {
      const token = service.signToken(userId);
      const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
      expect(service.verifyToken(tampered)).toBeNull();
    });

    it('rejects a token forged for another user', () => {
      // A token minted with a different secret must not verify.
      const token = service.signToken(userId);
      const swapped = Buffer.from('attacker').toString('base64url') +
        '.' + token.split('.')[1];
      expect(service.verifyToken(swapped)).toBeNull();
    });

    it('rejects a malformed token', () => {
      expect(service.verifyToken('not-a-token')).toBeNull();
      expect(service.verifyToken('')).toBeNull();
    });

    it('returns null (never throws) for a multi-byte signature part', () => {
      // A crafted sig whose char length can equal the expected but whose byte
      // length differs; timingSafeEqual would throw on unequal buffers.
      const token = service.signToken(userId);
      const userPart = token.split('.')[0];
      const multibyte = '€'.repeat(token.split('.')[1].length);
      expect(() =>
        service.verifyToken(`${userPart}.${multibyte}`),
      ).not.toThrow();
      expect(service.verifyToken(`${userPart}.${multibyte}`)).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('merges stored prefs over defaults', async () => {
      repo.findOne.mockResolvedValue({
        id: userId,
        emailPreferences: { billing: false },
      } as unknown as User);

      const prefs = await service.getByUserId(userId);
      expect(prefs).toEqual({
        billing: false,
        productUpdates: true,
        statsDigest: true,
      });
    });
  });

  describe('update', () => {
    it('only writes known boolean categories', async () => {
      repo.findOne.mockResolvedValue({
        id: userId,
        emailPreferences: {
          billing: true,
          productUpdates: true,
          statsDigest: true,
        },
      } as unknown as User);

      const next = await service.update(userId, {
        billing: false,
        // @ts-expect-error unknown key must be ignored
        hacker: true,
      });

      expect(next.billing).toBe(false);
      expect(repo.update).toHaveBeenCalledWith(userId, {
        emailPreferences: {
          billing: false,
          productUpdates: true,
          statsDigest: true,
        },
      });
    });
  });

  describe('unsubscribeByToken', () => {
    it('sets the category false for a valid token', async () => {
      repo.findOne.mockResolvedValue({
        id: userId,
        emailPreferences: {
          billing: true,
          productUpdates: true,
          statsDigest: true,
        },
      } as unknown as User);
      const token = service.signToken(userId);

      const next = await service.unsubscribeByToken(token, 'billing');
      expect(next.billing).toBe(false);
    });

    it('rejects an unknown category', async () => {
      const token = service.signToken(userId);
      await expect(
        service.unsubscribeByToken(token, 'nope' as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid token', async () => {
      await expect(
        service.unsubscribeByToken('bad', 'billing'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('accepts', () => {
    it('returns false only when the category is explicitly off', async () => {
      repo.findOne.mockResolvedValue({
        id: userId,
        emailPreferences: { billing: false },
      } as unknown as User);
      expect(await service.accepts(userId, 'billing')).toBe(false);
      expect(await service.accepts(userId, 'statsDigest')).toBe(true);
    });
  });
});
