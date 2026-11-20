import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';
import { ENTITY_IMPORTERS } from './entity-importer';
import { MulterExceptionFilter } from '@shared/filters/multer-exception.filter';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import { TIER_FEATURE_MESSAGE } from '@shared/utils/tier.util';

// The spool path is only visible to the interceptor, so the removal call is the one place to read it from.
jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, unlink: jest.fn(actual.unlink) };
});

const REGION_MESSAGE = 'Choose one of your company’s active regions.';
const CSV = Buffer.from('First Name,Phone\r\nSara,+966501234567\r\n', 'utf8');

// The interceptor fires unlink without awaiting it, so the response can land before the file is gone.
async function waitForRemoval(path: string): Promise<void> {
  for (let attempt = 0; attempt < 50 && existsSync(path); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Import upload cleanup', () => {
  let app: INestApplication;
  let tier: SubscriptionTier;
  const unlinkSpy = unlink as jest.MockedFunction<typeof unlink>;
  const actualUnlink =
    jest.requireActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    ).unlink;
  const findOne = jest.fn();
  const seen: string[] = [];
  const presentAtUnlink: boolean[] = [];

  const importer = (
    file: Express.Multer.File,
    _user: unknown,
    _companyId: string,
    regionCode?: string,
  ) => {
    seen.push(file.path);
    if (regionCode === 'paris') throw new BadRequestException(REGION_MESSAGE);
    return Promise.resolve({ willAdd: 1, willSkip: 0, failed: 0, rows: [] });
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DataTransferController],
      providers: [
        DataTransferService,
        { provide: getRepositoryToken(Company), useValue: { findOne } },
        {
          provide: ENTITY_IMPORTERS,
          useValue: { contacts: { preview: importer, commit: importer } },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            userId: 'user-uuid-1',
            email: 'user@example.com',
            companyId: 'company-uuid-1',
            role: 'company_admin',
            regionCodes: ['makkah'],
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new MulterExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    tier = SubscriptionTier.PRO;
    seen.length = 0;
    findOne.mockReset();
    findOne.mockImplementation(() =>
      Promise.resolve({
        id: 'company-uuid-1',
        subscriptionTier: tier,
        activeRegions: ['makkah', 'punjab'],
      }),
    );
    presentAtUnlink.length = 0;
    unlinkSpy.mockReset();
    unlinkSpy.mockImplementation((path) => {
      presentAtUnlink.push(existsSync(path));
      return actualUnlink(path);
    });
  });

  async function spooledPath(): Promise<string> {
    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    const path = unlinkSpy.mock.calls[0][0] as string;
    expect(path.startsWith(join(tmpdir(), 'import-'))).toBe(true);
    expect(path.endsWith('-contacts.csv')).toBe(true);
    expect(presentAtUnlink).toEqual([true]);
    await waitForRemoval(path);
    expect(existsSync(path)).toBe(false);
    return path;
  }

  for (const route of ['preview', 'commit']) {
    it(`removes the spooled file when ${route} is refused for the FREE tier`, async () => {
      tier = SubscriptionTier.FREE;
      const res = await request(app.getHttpServer())
        .post(`/data-transfer/contacts/${route}`)
        .attach('file', CSV, 'contacts.csv')
        .expect(403);
      expect(res.body.message).toBe(TIER_FEATURE_MESSAGE);
      expect(seen).toHaveLength(0);
      await spooledPath();
    });

    it(`removes the spooled file when ${route} is refused for a region the company lacks`, async () => {
      const res = await request(app.getHttpServer())
        .post(`/data-transfer/contacts/${route}`)
        .field('regionCode', 'paris')
        .attach('file', CSV, 'contacts.csv')
        .expect(400);
      expect(res.body.message).toBe(REGION_MESSAGE);
      const path = await spooledPath();
      expect(seen).toEqual([path]);
    });
  }

  it('removes the spooled file after a successful preview', async () => {
    await request(app.getHttpServer())
      .post('/data-transfer/contacts/preview')
      .field('regionCode', 'makkah')
      .attach('file', CSV, 'contacts.csv')
      .expect(201);
    const path = await spooledPath();
    expect(seen).toEqual([path]);
  });
});
