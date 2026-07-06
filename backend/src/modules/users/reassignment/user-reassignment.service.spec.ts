import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { UserReassignmentService } from './user-reassignment.service';
import { ReassignmentReport } from './reassignment-report';

const COMPANY_ID = '068dfa72-9a27-4527-b3e4-a4251d7ed643';
const FROM_USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TO_USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REASON = 'Agent left the company';

function makeManager(rawRows: Array<{ id: string }> = []): jest.Mocked<EntityManager> {
    const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: rawRows, affected: rawRows.length }),
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
            await service.reassignOwnedRecords(manager, COMPANY_ID, FROM_USER, TO_USER, REASON);

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
                'owner',
                'commission',
                'work_order',
                'contact',
            ]);
        });
    });
});
