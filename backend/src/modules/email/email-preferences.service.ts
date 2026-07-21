import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  DEFAULT_EMAIL_PREFERENCES,
  EmailPreferences,
  User,
} from '../users/entities/user.entity';

/** Suppressible categories a recipient can toggle. */
export type EmailCategory = keyof EmailPreferences;

const CATEGORIES: EmailCategory[] = ['billing', 'productUpdates', 'statsDigest'];

@Injectable()
export class EmailPreferencesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private secret(): string {
    // Reuse the app secret; the token only gates a preference toggle, not auth.
    return process.env.JWT_SECRET || 'dev-insecure-secret';
  }

  /** Stable, non-expiring token binding an unsubscribe link to one user. */
  signToken(userId: string): string {
    const mac = crypto
      .createHmac('sha256', this.secret())
      .update(userId)
      .digest('base64url');
    return `${Buffer.from(userId).toString('base64url')}.${mac}`;
  }

  /** Returns the userId if the token is valid, else null (constant-time compare). */
  verifyToken(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    let userId: string;
    try {
      userId = Buffer.from(parts[0], 'base64url').toString('utf8');
    } catch {
      return null;
    }
    const expected = crypto
      .createHmac('sha256', this.secret())
      .update(userId)
      .digest('base64url');
    const got = parts[1];
    if (
      expected.length !== got.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))
    ) {
      return null;
    }
    return userId;
  }

  /** URL a footer links to for one-click unsubscribe from a category. */
  unsubscribeUrl(userId: string, category: EmailCategory): string {
    const base = (process.env.APP_URL || 'http://localhost:4200').replace(
      /\/$/,
      '',
    );
    const token = this.signToken(userId);
    return `${base}/settings/notifications?token=${encodeURIComponent(token)}&unsubscribe=${category}`;
  }

  async getByUserId(userId: string): Promise<EmailPreferences> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'emailPreferences'],
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...DEFAULT_EMAIL_PREFERENCES, ...(user.emailPreferences ?? {}) };
  }

  async update(
    userId: string,
    patch: Partial<EmailPreferences>,
  ): Promise<EmailPreferences> {
    const current = await this.getByUserId(userId);
    const next: EmailPreferences = { ...current };
    for (const key of CATEGORIES) {
      if (typeof patch[key] === 'boolean') {
        next[key] = patch[key] as boolean;
      }
    }
    await this.userRepository.update(userId, { emailPreferences: next });
    return next;
  }

  /** One-click unsubscribe used by the token-gated footer link. */
  async unsubscribeByToken(
    token: string,
    category: EmailCategory,
  ): Promise<EmailPreferences> {
    if (!CATEGORIES.includes(category)) {
      throw new BadRequestException('Unknown email category');
    }
    const userId = this.verifyToken(token);
    if (!userId) throw new BadRequestException('Invalid or expired link');
    return this.update(userId, { [category]: false });
  }

  /** Whether a user currently accepts a suppressible category. */
  async accepts(userId: string, category: EmailCategory): Promise<boolean> {
    const prefs = await this.getByUserId(userId);
    return prefs[category] !== false;
  }
}
