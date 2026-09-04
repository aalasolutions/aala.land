import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { UserReassignmentService } from './user-reassignment.service';
import { ReassignmentReport } from './reassignment-report';

const COMPANY_ID = '068dfa72-9a27-4527-b3e4-a4251d7ed643';
const FROM_USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TO_USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REASON = 'Agent left the company';

function makeManager(
  rawRows: Array<{ id: string }> = [],
): jest.Mocked<EntityManager> {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest
      .fn()
      .mockResolvedValue({ raw: rawRows, affected: rawRows.length }),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as jest.Mocked<EntityManager>;
}

describe('UserReassignmentService', () => {
  let service: UserReassignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserReassignmentService],
    }).compile();

    service = module.get<UserReassignmentService>(UserReassignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reassignOwnedRecords', () => {
    it('returns a report with entity counts when rows are reassigned', async () => {
      const manager = makeManager([{ id: 'lead-id-1' }]);
      const report: ReassignmentReport = await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      expect(report.fromUserId).toBe(FROM_USER);
      expect(report.toUserId).toBe(TO_USER);
      expect(report.reason).toBe(REASON);
      // 6 entity types are always present in the report
      expect(report.entities).toHaveLength(6);
    });

    it('returns zero counts when no records belong to the removed user', async () => {
      const manager = makeManager([]);
      const report = await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      report.entities.forEach((e) => {
        expect(e.count).toBe(0);
        expect(e.ids).toHaveLength(0);
      });
    });

    it('calls the QueryBuilder once per entity type (6 times)', async () => {
      const manager = makeManager([]);
      await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      // createQueryBuilder is called once per REASSIGNMENT_TARGET (6)
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(6);
    });

    it('includes the correct entity types in the frozen order', async () => {
      const manager = makeManager([]);
      const report = await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      const types = report.entities.map((e) => e.type);
      expect(types).toEqual([
        'lead',
        'document',
        'unit',
        'commission',
        'work_order',
        'contact',
      ]);
    });

    it('collects ids via RETURNING when collectIds is true', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: [{ id: 'x1' }, { id: 'x2' }],
          affected: 2,
        }),
      };
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as jest.Mocked<EntityManager>;

      const report = await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
        { collectIds: true },
      );

      expect(qb.returning).toHaveBeenCalledWith('id');
      expect(
        report.entities.every((e) => e.count === 2 && e.ids.length === 2),
      ).toBe(true);
    });

    it('uses affected counts and skips RETURNING when collectIds is false (default)', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest
          .fn()
          .mockResolvedValue({ raw: [{ id: 'x1' }], affected: 3 }),
      };
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as jest.Mocked<EntityManager>;

      const report = await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      expect(qb.returning).not.toHaveBeenCalled();
      expect(
        report.entities.every((e) => e.count === 3 && e.ids.length === 0),
      ).toBe(true);
    });
  });

  describe('WhatsApp rows stay with the departing agent', () => {
    it('exposes no API that moves chat or message rows between users', () => {
      const surface = [
        ...Object.getOwnPropertyNames(UserReassignmentService.prototype),
        ...Object.keys(service),
      ];

      expect(surface).not.toContain('reassignWhatsappRows');
      expect(surface.filter((n) => /whatsapp/i.test(n))).toEqual([]);
    });

    it('reassigns nothing on a whatsapp table', async () => {
      const manager = makeManager([]);
      await service.reassignOwnedRecords(
        manager,
        COMPANY_ID,
        FROM_USER,
        TO_USER,
        REASON,
      );

      const qb = (manager.createQueryBuilder as jest.Mock).mock.results[0]
        .value as { update: jest.Mock; where: jest.Mock };
      const updatedEntities = qb.update.mock.calls.map(
        ([entity]: [{ name?: string }]) => entity?.name,
      );
      expect(updatedEntities).toEqual([
        'Lead',
        'PropertyDocument',
        'Unit',
        'Commission',
        'WorkOrder',
        'Contact',
      ]);
      const clauses = qb.where.mock.calls.map(([clause]: [string]) => clause);
      expect(clauses.some((c) => /whatsapp/i.test(c))).toBe(false);
    });

    it('needs no DataSource, because nothing here runs outside the caller transaction', () => {
      expect(UserReassignmentService.length).toBe(0);
    });
  });
});
