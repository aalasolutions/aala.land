import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { readSheet } from 'read-excel-file/node';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService, TRANSFER_TIERS } from './data-transfer.service';
import { ENTITY_IMPORTERS } from './entity-importer';
import { MulterExceptionFilter } from '@shared/filters/multer-exception.filter';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import { TIER_FEATURE_MESSAGE } from '@shared/utils/tier.util';
import { UNIT_COLUMNS } from '../properties/transfer/unit.columns';
import { AMENITY_KEYS } from '../properties/amenity-keys';

const HEADERS = [
  'First Name',
  'Last Name',
  'Phone',
  'Email',
  'WhatsApp',
  'Nationality',
  'National ID',
  'Company',
  'Job Title',
  'Address',
  'Notes',
  'Region',
];

describe('DataTransferController (template)', () => {
  let app: INestApplication;
  let tier: SubscriptionTier;
  let role: string;
  let companyId: string | null;
  const findOne = jest.fn();
  const preview = jest.fn();
  const commit = jest.fn();
  const unitsPreview = jest.fn();
  const unitsCommit = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DataTransferController],
      providers: [
        DataTransferService,
        { provide: getRepositoryToken(Company), useValue: { findOne } },
        {
          provide: ENTITY_IMPORTERS,
          useValue: {
            contacts: { preview, commit },
            units: { preview: unitsPreview, commit: unitsCommit },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            userId: 'user-uuid-1',
            email: 'user@example.com',
            companyId,
            role,
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
    tier = SubscriptionTier.ENTERPRISE;
    role = 'company_admin';
    companyId = 'company-uuid-1';
    findOne.mockReset();
    preview.mockReset();
    commit.mockReset();
    unitsPreview.mockReset();
    unitsCommit.mockReset();
    unitsPreview.mockResolvedValue({
      fileName: 'units.csv',
      willAdd: 1,
      willSkip: 0,
      failed: 0,
      fileErrors: [],
      rows: [],
    });
    unitsCommit.mockResolvedValue({
      added: 1,
      skipped: 0,
      failed: 0,
      failedRows: [],
    });
    preview.mockResolvedValue({
      fileName: 'x.csv',
      willAdd: 1,
      willSkip: 0,
      failed: 0,
      fileErrors: [],
      rows: [],
    });
    commit.mockResolvedValue({
      added: 1,
      skipped: 0,
      failed: 0,
      failedRows: [],
    });
    findOne.mockImplementation(({ select }: { select: string[] }) =>
      Promise.resolve(
        select.includes('activeRegions')
          ? { id: companyId, activeRegions: ['makkah', 'punjab'] }
          : { id: companyId, subscriptionTier: tier },
      ),
    );
  });

  it('refuses every role below COMPANY_ADMIN', async () => {
    for (const other of ['admin', 'manager', 'agent', 'accountant']) {
      role = other;
      await request(app.getHttpServer())
        .get('/data-transfer/contacts/template')
        .expect(403);
    }
  });

  it('refuses a super admin with no company', async () => {
    role = 'super_admin';
    companyId = null;
    await request(app.getHttpServer())
      .get('/data-transfer/contacts/template')
      .expect(403);
  });

  it('refuses every tier outside TRANSFER_TIERS.import with the plain message', async () => {
    const blocked = Object.values(SubscriptionTier).filter(
      (candidate) => !TRANSFER_TIERS.import.includes(candidate),
    );
    expect(blocked).toContain(SubscriptionTier.FREE);
    for (const candidate of blocked) {
      tier = candidate;
      const res = await request(app.getHttpServer())
        .get('/data-transfer/contacts/template')
        .expect(403);
      expect(res.body.message).toBe(TIER_FEATURE_MESSAGE);
    }
  });

  it('serves the template to every tier in TRANSFER_TIERS.import', async () => {
    expect(TRANSFER_TIERS.import).toEqual(
      expect.arrayContaining([
        SubscriptionTier.PRO,
        SubscriptionTier.ENTERPRISE,
      ]),
    );
    for (const candidate of TRANSFER_TIERS.import) {
      tier = candidate;
      await request(app.getHttpServer())
        .get('/data-transfer/contacts/template')
        .expect(200);
    }
  });

  it('returns 404 for an unknown entity and 400 for a bad format', async () => {
    await request(app.getHttpServer())
      .get('/data-transfer/widgets/template')
      .expect(404);
    await request(app.getHttpServer())
      .get('/data-transfer/contacts/template?format=pdf')
      .expect(400);
  });

  it('serves the CSV template with the twelve headers and one example row', async () => {
    const res = await request(app.getHttpServer())
      .get('/data-transfer/contacts/template')
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="contacts-template.csv"',
    );
    const lines = res.text.replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].split(',')).toEqual(HEADERS);
    expect(lines[1]).toContain('Sara');
  });

  it('serves the XLSX template with the same headers and the region values', async () => {
    const res = await request(app.getHttpServer())
      .get('/data-transfer/contacts/template?format=xlsx')
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="contacts-template.xlsx"',
    );
    const body = res.body as Buffer;
    const data = await readSheet(body, 1);
    expect(data[0]).toEqual(HEADERS);
    expect(data).toHaveLength(2);
    const allowed = await readSheet(body, 2);
    expect(allowed).toEqual(
      expect.arrayContaining([
        ['WhatsApp', 'Yes'],
        ['WhatsApp', 'No'],
        ['Region', 'makkah'],
        ['Region', 'punjab'],
      ]),
    );
  });

  describe('preview and commit', () => {
    const csv = Buffer.from(
      'First Name,Phone\r\nSara,+966501234567\r\n',
      'utf8',
    );

    it('refuses roles below COMPANY_ADMIN and blocked tiers', async () => {
      role = 'manager';
      await request(app.getHttpServer())
        .post('/data-transfer/contacts/preview')
        .attach('file', csv, 'contacts.csv')
        .expect(403);
      role = 'company_admin';
      tier = SubscriptionTier.FREE;
      const res = await request(app.getHttpServer())
        .post('/data-transfer/contacts/commit')
        .attach('file', csv, 'contacts.csv')
        .expect(403);
      expect(res.body.message).toBe(TIER_FEATURE_MESSAGE);
      expect(preview).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('passes the file, the user and the picked region to the importer', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/contacts/preview')
        .field('regionCode', 'makkah')
        .attach('file', csv, 'contacts.csv')
        .expect(201);
      expect(res.body.willAdd).toBe(1);
      const [file, user, companyId, regionCode] = preview.mock.calls[0];
      expect(file.originalname).toBe('contacts.csv');
      expect(user.userId).toBe('user-uuid-1');
      expect(companyId).toBe('company-uuid-1');
      expect(regionCode).toBe('makkah');
      await request(app.getHttpServer())
        .post('/data-transfer/contacts/commit')
        .attach('file', csv, 'contacts.csv')
        .expect(201);
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong extension with the plain message', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/contacts/preview')
        .attach('file', csv, 'contacts.txt')
        .expect(400);
      expect(res.body.message).toBe('Upload a CSV or Excel (.xlsx) file.');
    });

    it('rejects a file over 5 MB with 413', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 1, 97);
      await request(app.getHttpServer())
        .post('/data-transfer/contacts/preview')
        .attach('file', big, 'contacts.csv')
        .expect(413);
    });

    it('returns 404 for an unknown entity on preview and commit', async () => {
      for (const action of ['preview', 'commit']) {
        const res = await request(app.getHttpServer())
          .post(`/data-transfer/widgets/${action}`)
          .attach('file', csv, 'contacts.csv')
          .expect(404);
        expect(res.body.message).toBe('This kind of data cannot be imported.');
      }
      expect(preview).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe('failed-file', () => {
    it('streams the rows with a Reason column in CSV', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/contacts/failed-file')
        .send({
          rows: [
            {
              values: { firstName: 'Sara', phone: '+966501234567' },
              reason: 'Already exists in Makkah',
            },
            {
              values: { lastName: 'Omar' },
              reason: 'This cell is required.',
              column: 'First Name',
            },
          ],
        })
        .expect(201);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="contacts-not-imported.csv"',
      );
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lines[0].split(',')).toEqual([...HEADERS, 'Reason']);
      expect(lines[1]).toContain('Already exists in Makkah');
      expect(lines[1].startsWith('Sara,,+966501234567')).toBe(true);
      expect(lines[2]).toContain('First Name: This cell is required.');
    });

    it('rejects a body without rows', async () => {
      await request(app.getHttpServer())
        .post('/data-transfer/contacts/failed-file')
        .send({ nope: true })
        .expect(400);
    });
  });

  describe('units', () => {
    const UNIT_HEADERS = UNIT_COLUMNS.map((column) => column.header);
    const csv = Buffer.from(
      'City,Locality,Asset,Unit Number,Sub Type\r\nRiyadh,Al Olaya,Olaya Towers,1204,APARTMENT\r\n',
      'utf8',
    );

    it('serves the CSV template with the eighteen unit headers and one example row', async () => {
      const res = await request(app.getHttpServer())
        .get('/data-transfer/units/template')
        .expect(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="units-template.csv"',
      );
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lines).toHaveLength(2);
      expect(lines[0].split(',')).toEqual(UNIT_HEADERS);
      expect(lines[1]).toContain('Olaya Towers');
    });

    it('lists Sub Type, Status, Listing Type and amenity keys on the XLSX Allowed values sheet', async () => {
      const res = await request(app.getHttpServer())
        .get('/data-transfer/units/template?format=xlsx')
        .buffer()
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="units-template.xlsx"',
      );
      const body = res.body as Buffer;
      const data = await readSheet(body, 1);
      expect(data[0]).toEqual(UNIT_HEADERS);
      expect(data).toHaveLength(2);
      const allowed = await readSheet(body, 2);
      expect(allowed).toEqual(
        expect.arrayContaining([
          ['Sub Type', 'APARTMENT'],
          ['Sub Type', 'LAND_PLOT'],
          ['Status', 'available'],
          ['Status', 'maintenance'],
          ['Listing Type', 'RENTAL'],
          ['Listing Type', 'FOR_SALE'],
          ['Amenities', 'gym'],
          ['Amenities', 'wifi'],
        ]),
      );
      const amenityRows = allowed.filter((row) => row[0] === 'Amenities');
      expect(amenityRows).toHaveLength(AMENITY_KEYS.length);
      expect(allowed.some((row) => row[0] === 'Region')).toBe(false);
    });

    it('routes preview and commit to the units importer', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/units/preview')
        .attach('file', csv, 'units.csv')
        .expect(201);
      expect(res.body.fileName).toBe('units.csv');
      const [file, user, companyId] = unitsPreview.mock.calls[0];
      expect(file.originalname).toBe('units.csv');
      expect(user.userId).toBe('user-uuid-1');
      expect(companyId).toBe('company-uuid-1');
      await request(app.getHttpServer())
        .post('/data-transfer/units/commit')
        .attach('file', csv, 'units.csv')
        .expect(201);
      expect(unitsCommit).toHaveBeenCalledTimes(1);
      expect(preview).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('refuses roles below COMPANY_ADMIN and blocked tiers', async () => {
      role = 'manager';
      await request(app.getHttpServer())
        .get('/data-transfer/units/template')
        .expect(403);
      await request(app.getHttpServer())
        .post('/data-transfer/units/preview')
        .attach('file', csv, 'units.csv')
        .expect(403);
      role = 'company_admin';
      tier = SubscriptionTier.FREE;
      const res = await request(app.getHttpServer())
        .post('/data-transfer/units/commit')
        .attach('file', csv, 'units.csv')
        .expect(403);
      expect(res.body.message).toBe(TIER_FEATURE_MESSAGE);
      expect(unitsPreview).not.toHaveBeenCalled();
      expect(unitsCommit).not.toHaveBeenCalled();
    });

    it('streams the not-imported rows with the unit headers plus Reason', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/units/failed-file')
        .send({
          rows: [
            {
              values: {
                city: 'Riyadh',
                asset: 'Olaya Towers',
                unitNumber: '1204',
              },
              reason: 'Already exists in Olaya Towers',
            },
          ],
        })
        .expect(201);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="units-not-imported.csv"',
      );
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lines[0].split(',')).toEqual([...UNIT_HEADERS, 'Reason']);
      expect(lines[1]).toContain('Already exists in Olaya Towers');
    });

    it('streams the units without an owner as Asset, Unit Number, Link and Reason', async () => {
      const res = await request(app.getHttpServer())
        .post('/data-transfer/units/notes-file')
        .send({
          rows: [
            {
              values: {
                asset: 'Olaya Towers',
                unitNumber: '1204',
                link: 'https://app.example.com/properties/loc-1/unit/unit-1',
              },
              reason: 'Owner not found, unit imported without owner.',
            },
          ],
        })
        .expect(201);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="units-without-owner.csv"',
      );
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lines[0].split(',')).toEqual([
        'Asset',
        'Unit Number',
        'Link',
        'Reason',
      ]);
      expect(lines[1]).toBe(
        'Olaya Towers,1204,https://app.example.com/properties/loc-1/unit/unit-1,"Owner not found, unit imported without owner."',
      );
    });

    it('has no notes file for contacts and rejects a body without rows', async () => {
      await request(app.getHttpServer())
        .post('/data-transfer/contacts/notes-file')
        .send({ rows: [{ values: {}, reason: 'x' }] })
        .expect(404);
      await request(app.getHttpServer())
        .post('/data-transfer/units/notes-file')
        .send({})
        .expect(400);
    });
  });
});
