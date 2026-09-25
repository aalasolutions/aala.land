import { Test, TestingModule } from '@nestjs/testing';
import { In } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { StoragePurgeService } from './storage-purge.service';
import {
  StorageBucketKind,
  StoragePurgeJob,
} from './entities/storage-purge-job.entity';
import { STORAGE_PURGE_QUEUE } from './storage-purge.constants';
import { PropertyMedia } from '../properties/entities/property-media.entity';
import { PropertyDocument } from '../properties/entities/property-document.entity';
import { Company } from '../companies/entities/company.entity';

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('StoragePurgeService', () => {
  let service: StoragePurgeService;
  let queue: { add: jest.Mock; addBulk: jest.Mock };
  let manager: any;
  let qbs: any[];

  const makeQb = () => {
    const qb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    qbs.push(qb);
    return qb;
  };

  const media = (overrides: Partial<PropertyMedia> = {}) =>
    ({
      id: 'media-1',
      companyId: COMPANY_A,
      s3Key: 'land/companies/a/properties/u1/123-photo.jpg',
      thumbnailUrl: 'https://s3.example.com/thumb.jpg',
      fileSize: 1000,
      thumbnailSize: 200,
      ...overrides,
    }) as PropertyMedia;

  const document = (overrides: Partial<PropertyDocument> = {}) =>
    ({
      id: 'doc-1',
      companyId: COMPANY_A,
      s3Key: 'land/companies/a/documents/123-lease.pdf',
      fileSize: 5000,
      ...overrides,
    }) as PropertyDocument;

  beforeEach(async () => {
    qbs = [];
    let seq = 0;
    manager = {
      create: jest.fn((_entity, rows) => rows),
      save: jest.fn(async (_entity, rows) =>
        rows.map((r: object) => ({ ...r, id: `purge-${++seq}` })),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => makeQb()),
    };
    queue = {
      add: jest.fn().mockResolvedValue({}),
      addBulk: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoragePurgeService,
        { provide: getQueueToken(STORAGE_PURGE_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(StoragePurgeService);
  });

  describe('purge', () => {
    it('writes an outbox row for the media original and its thumbnail', async () => {
      const ids = await service.purge(manager, { media: [media()] });

      expect(ids).toEqual(['purge-1', 'purge-2']);
      const [entity, rows] = manager.save.mock.calls[0];
      expect(entity).toBe(StoragePurgeJob);
      expect(rows).toEqual([
        expect.objectContaining({
          companyId: COMPANY_A,
          bucketKind: StorageBucketKind.MEDIA,
          s3Key: 'land/companies/a/properties/u1/123-photo.jpg',
          bytes: 1000,
          sourceType: 'PropertyMedia',
          sourceId: 'media-1',
        }),
        expect.objectContaining({
          bucketKind: StorageBucketKind.MEDIA,
          s3Key: 'land/companies/a/properties/u1/thumbs/thumb-123-photo.jpg',
          bytes: 200,
        }),
      ]);
    });

    it('still queues the derived thumbnail key when thumbnail metadata is missing', async () => {
      await service.purge(manager, {
        media: [media({ thumbnailUrl: null, thumbnailSize: null })],
      });

      const [, rows] = manager.save.mock.calls[0];
      expect(rows).toHaveLength(2);
      expect(rows[1]).toEqual(
        expect.objectContaining({
          s3Key: 'land/companies/a/properties/u1/thumbs/thumb-123-photo.jpg',
          bytes: 0,
        }),
      );
    });

    it('writes a documents-bucket outbox row for a document', async () => {
      await service.purge(manager, { documents: [document()] });

      const [, rows] = manager.save.mock.calls[0];
      expect(rows).toEqual([
        expect.objectContaining({
          bucketKind: StorageBucketKind.DOCUMENTS,
          s3Key: 'land/companies/a/documents/123-lease.pdf',
          bytes: 5000,
          sourceType: 'PropertyDocument',
          sourceId: 'doc-1',
        }),
      ]);
    });

    it('deletes the media and document rows by id, scoped to their company', async () => {
      await service.purge(manager, {
        media: [media(), media({ id: 'media-2' })],
        documents: [document()],
      });

      const [mediaEntity, mediaWhere] = manager.delete.mock.calls[0];
      expect(mediaEntity).toBe(PropertyMedia);
      expect(mediaWhere.companyId).toBe(COMPANY_A);
      expect(mediaWhere.id.value).toEqual(['media-1', 'media-2']);
      const [docEntity, docWhere] = manager.delete.mock.calls[1];
      expect(docEntity).toBe(PropertyDocument);
      expect(docWhere.companyId).toBe(COMPANY_A);
      expect(docWhere.id.value).toEqual(['doc-1']);
    });

    it('deletes rows from two companies with their own companyId scope', async () => {
      await service.purge(manager, {
        media: [media(), media({ id: 'media-2', companyId: COMPANY_B })],
      });

      expect(manager.delete).toHaveBeenCalledTimes(2);
      const [entityA, whereA] = manager.delete.mock.calls[0];
      expect(entityA).toBe(PropertyMedia);
      expect(whereA).toEqual({ companyId: COMPANY_A, id: In(['media-1']) });
      const [entityB, whereB] = manager.delete.mock.calls[1];
      expect(entityB).toBe(PropertyMedia);
      expect(whereB).toEqual({ companyId: COMPANY_B, id: In(['media-2']) });
    });

    it('decrements quota once per company by the summed bytes', async () => {
      await service.purge(manager, {
        media: [media(), media({ id: 'media-2', companyId: COMPANY_B })],
        documents: [document()],
      });

      expect(qbs).toHaveLength(2);
      const byCompany = Object.fromEntries(
        qbs.map((qb) => [
          qb.where.mock.calls[0][1].companyId,
          qb.setParameter.mock.calls[0][1],
        ]),
      );
      expect(byCompany).toEqual({ [COMPANY_A]: 6200, [COMPANY_B]: 1200 });
      qbs.forEach((qb) => {
        expect(qb.update).toHaveBeenCalledWith(Company);
        expect(qb.set.mock.calls[0][0].storageUsedBytes()).toBe(
          'GREATEST("storage_used_bytes" - :bytes, 0)',
        );
        expect(qb.execute).toHaveBeenCalled();
      });
    });

    it('still deletes a row with no storage key, without an outbox row', async () => {
      const ids = await service.purge(manager, {
        documents: [document({ s3Key: null, fileSize: null })],
      });

      expect(ids).toEqual([]);
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.delete).toHaveBeenCalledWith(
        PropertyDocument,
        expect.anything(),
      );
      expect(qbs).toHaveLength(0);
    });

    it('writes a WhatsApp outbox row and releases its bytes without deleting any row', async () => {
      const ids = await service.purge(manager, {
        whatsapp: [
          {
            companyId: COMPANY_A,
            s3Key: 'whatsapp/a/msg-1',
            bytes: 4096,
            sourceId: 'msg-1',
          },
        ],
      });

      expect(ids).toEqual(['purge-1']);
      const [entity, rows] = manager.save.mock.calls[0];
      expect(entity).toBe(StoragePurgeJob);
      expect(rows).toEqual([
        expect.objectContaining({
          companyId: COMPANY_A,
          bucketKind: StorageBucketKind.WHATSAPP,
          s3Key: 'whatsapp/a/msg-1',
          bytes: 4096,
          sourceType: 'WhatsappMessage',
          sourceId: 'msg-1',
        }),
      ]);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(qbs).toHaveLength(1);
      expect(qbs[0].update).toHaveBeenCalledWith(Company);
      expect(qbs[0].setParameter).toHaveBeenCalledWith('bytes', 4096);
      expect(qbs[0].where).toHaveBeenCalledWith('id = :companyId', {
        companyId: COMPANY_A,
      });
    });

    it('queues a zero-byte WhatsApp item without touching quota', async () => {
      await service.purge(manager, {
        whatsapp: [
          {
            companyId: COMPANY_A,
            s3Key: 'whatsapp/a/st',
            bytes: 0,
            sourceId: 'st',
          },
        ],
      });

      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(qbs).toHaveLength(0);
    });

    it('does nothing for an empty file set', async () => {
      await expect(service.purge(manager, {})).resolves.toEqual([]);
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('propagates a failure so the caller transaction rolls back', async () => {
      manager.delete.mockRejectedValue(new Error('deadlock detected'));

      await expect(
        service.purge(manager, { media: [media()] }),
      ).rejects.toThrow('deadlock detected');
    });
  });

  describe('dispatch', () => {
    it('enqueues all jobs in one addBulk call, each with its id as jobId, 5 attempts and exponential backoff', async () => {
      await service.dispatch(['purge-1', 'purge-2']);

      expect(queue.addBulk).toHaveBeenCalledTimes(1);
      expect(queue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'purge',
          data: { id: 'purge-1' },
          opts: expect.objectContaining({
            jobId: 'purge-1',
            attempts: 5,
            backoff: expect.objectContaining({ type: 'exponential' }),
          }),
        }),
        expect.objectContaining({
          name: 'purge',
          data: { id: 'purge-2' },
          opts: expect.objectContaining({ jobId: 'purge-2' }),
        }),
      ]);
    });

    it('does nothing for an empty id list', async () => {
      await service.dispatch([]);

      expect(queue.addBulk).not.toHaveBeenCalled();
    });

    it('logs and swallows the error when addBulk fails', async () => {
      queue.addBulk.mockRejectedValueOnce(new Error('connection refused'));
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.dispatch(['purge-1', 'purge-2']),
      ).resolves.toBeUndefined();
      expect(queue.addBulk).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    });
  });
});
