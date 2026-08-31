import { Controller, Get, INestApplication, Query, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { RegionScopeInterceptor } from './region-scope.interceptor';
import { Company } from '../../modules/companies/entities/company.entity';
import { ListWaMessagesDto } from '../../modules/whatsapp/dto/list-wa-messages.dto';

@Controller('wa')
class ProbeController {
  @Get('messages')
  getAllMessages(@Query() query: ListWaMessagesDto) {
    return { ok: true, seen: query };
  }
}

describe('RegionScopeInterceptor against the global ValidationPipe', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: RegionScopeInterceptor },
        {
          provide: getRepositoryToken(Company),
          useValue: { findOne: jest.fn().mockResolvedValue({ defaultRegionCode: 'makkah' }) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same options as src/main.ts
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Stand in for JwtAuthGuard populating req.user
    app.use((req: any, _res: any, next: any) => {
      req.user = { userId: 'u1', role: req.headers['x-role'], companyId: 'c1' };
      next();
    });
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  // The interceptor writes regionCode into req.query for every region-scoped
  // role. Any bare @Query() DTO that does not declare it is rejected by
  // forbidNonWhitelisted before the handler ever runs.
  it('AGENT reaches the handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/wa/messages?page=1')
      .set('x-role', 'agent');
    expect(res.status).toBe(200);
  });

  it('MANAGER reaches the handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/wa/messages?page=1')
      .set('x-role', 'manager');
    expect(res.status).toBe(200);
  });

  it('COMPANY_ADMIN reaches the handler, unscoped', async () => {
    const res = await request(app.getHttpServer())
      .get('/wa/messages?page=1')
      .set('x-role', 'company_admin');
    expect(res.status).toBe(200);
    expect(res.body.seen.regionCode).toBeUndefined();
  });
});
