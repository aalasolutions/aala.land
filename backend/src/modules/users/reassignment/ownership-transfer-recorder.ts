import { EntityManager } from 'typeorm';
import { ReassignmentReport } from './reassignment-report';

export interface OwnershipTransferRecorder {
    record(manager: EntityManager, companyId: string, report: ReassignmentReport): Promise<void>;
}

export const OWNERSHIP_TRANSFER_RECORDER = Symbol('OWNERSHIP_TRANSFER_RECORDER');
