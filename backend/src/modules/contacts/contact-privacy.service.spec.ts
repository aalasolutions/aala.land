import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { Role } from '@shared/enums/roles.enum';
import {
  ContactPrivacyService,
  ContactViewer,
  FullContactView,
} from './contact-privacy.service';
import { Contact } from './entities/contact.entity';
import { User } from '../users/entities/user.entity';
import {
  ContactAccessRequest,
  ContactAccessStatus,
} from '../contact-access-requests/entities/contact-access-request.entity';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';

const companyId = 'company-uuid-1';

function contact(id: string, regionCode: string, createdBy: string): Contact {
  return {
    id,
    companyId,
    firstName: 'Test',
    lastName: 'User',
    email: 'user@example.com',
    phone: '+971501234567',
    isWhatsapp: true,
    nationality: 'Emirati',
    nationalId: '784-0000-0000000-0',
    contactCompany: 'Example Co',
    jobTitle: 'Buyer',
    address: 'Somewhere',
    notes: 'Private note',
    regionCode,
    createdBy,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  } as Contact;
}

const created = contact('c-created', 'makkah', 'me');
const granted = contact('c-granted', 'makkah', 'other-user');
const pending = contact('c-pending', 'makkah', 'other-user');
const ownRegion = contact('c-own', 'dubai', 'other-user');
const otherRegion = contact('c-other', 'makkah', 'other-user');
const page = [created, granted, pending, ownRegion, otherRegion];

const FORBIDDEN_LIMITED_FIELDS = [
  'lastName',
  'email',
  'phone',
  'nationalId',
  'nationality',
  'contactCompany',
  'jobTitle',
  'address',
  'notes',
  'isWhatsapp',
];

describe('ContactPrivacyService', () => {
  let service: ContactPrivacyService;
  let userRepo: { find: jest.Mock };
  let accessRepo: { find: jest.Mock };
  let accessRequests: { grantedContactIds: jest.Mock };

  beforeEach(async () => {
    userRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'me', name: 'Test User', email: 'me@example.com' },
        { id: 'other-user', name: '  ', email: 'other@example.com' },
      ]),
    };
    accessRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'r1', contactId: 'c-pending' }]),
    };
    accessRequests = {
      grantedContactIds: jest.fn().mockResolvedValue(new Set(['c-granted'])),
    };
    const module = await Test.createTestingModule({
      providers: [
        ContactPrivacyService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: getRepositoryToken(ContactAccessRequest),
          useValue: accessRepo,
        },
        { provide: ContactAccessRequestsService, useValue: accessRequests },
      ],
    }).compile();
    service = module.get(ContactPrivacyService);
  });

  const viewer = (role: string): ContactViewer => ({
    userId: 'me',
    role,
    regionCodes: ['dubai'],
  });

  describe('access matrix', () => {
    const F = 'FULL';
    const L = 'LIMITED';
    it.each([
      // role, created, granted, pending, own region, other region
      [Role.SUPER_ADMIN, [F, F, F, F, F]],
      [Role.COMPANY_ADMIN, [F, F, F, F, F]],
      [Role.ADMIN, [F, F, L, F, L]],
      [Role.MANAGER, [F, F, L, F, L]],
      [Role.ACCOUNTANT, [F, F, L, F, L]],
      [Role.AGENT, [F, F, L, L, L]],
      ['unknown_role', [L, L, L, L, L]],
    ])('%s', async (role, expected) => {
      const levels = await service.accessLevelFor(
        companyId,
        viewer(role),
        page,
      );

      expect(page.map((c) => levels.get(c.id))).toEqual(expected);
    });

    it('gives LIMITED on everything when there is no viewer', async () => {
      const levels = await service.accessLevelFor(companyId, undefined, page);

      expect([...levels.values()]).toEqual([L, L, L, L, L]);
      expect(accessRequests.grantedContactIds).not.toHaveBeenCalled();
    });

    it('asks for grants once per page, only for contacts the agent did not create', async () => {
      await service.accessLevelFor(companyId, viewer(Role.AGENT), page);

      expect(accessRequests.grantedContactIds).toHaveBeenCalledTimes(1);
      expect(accessRequests.grantedContactIds).toHaveBeenCalledWith(
        companyId,
        'me',
        ['c-granted', 'c-pending', 'c-own', 'c-other'],
      );
    });

    it('never looks up grants for company-wide roles', async () => {
      await service.accessLevelFor(companyId, viewer(Role.COMPANY_ADMIN), page);

      expect(accessRequests.grantedContactIds).not.toHaveBeenCalled();
    });

    it('unlocks a region-scoped role outside its regions by creator or grant only', async () => {
      accessRequests.grantedContactIds.mockResolvedValue(new Set([granted.id]));

      const levels = await service.accessLevelFor(
        companyId,
        viewer(Role.MANAGER),
        page,
      );

      expect(levels.get(ownRegion.id)).toBe('FULL');
      expect(levels.get(created.id)).toBe('FULL');
      expect(levels.get(granted.id)).toBe('FULL');
      expect(levels.get(otherRegion.id)).toBe('LIMITED');
      const [, , askedIds] = accessRequests.grantedContactIds.mock.calls[0];
      expect(askedIds).not.toContain(ownRegion.id);
      expect(askedIds).not.toContain(created.id);
    });

    it('treats a contact with no creator as not created by the agent', async () => {
      accessRequests.grantedContactIds.mockResolvedValue(new Set());
      const orphan = { ...created, createdBy: null } as Contact;

      const levels = await service.accessLevelFor(
        companyId,
        { userId: '', role: Role.AGENT, regionCodes: [] },
        [orphan],
      );

      expect(levels.get(orphan.id)).toBe('LIMITED');
    });
  });

  describe('presentMany', () => {
    it('keeps input order and shapes each row for an agent', async () => {
      const result = await service.presentMany(
        companyId,
        viewer(Role.AGENT),
        page,
      );

      expect(result.map((r) => [r.id, r.accessLevel])).toEqual([
        ['c-created', 'FULL'],
        ['c-granted', 'FULL'],
        ['c-pending', 'LIMITED'],
        ['c-own', 'LIMITED'],
        ['c-other', 'LIMITED'],
      ]);
      expect(result[2]).toMatchObject({ accessPending: true });
      expect(result[3]).toMatchObject({ accessPending: false });
    });

    it('returns the full row plus access level and creator name for FULL', async () => {
      const [full] = (await service.presentMany(
        companyId,
        viewer(Role.COMPANY_ADMIN),
        [created],
      )) as FullContactView[];

      expect(full).toEqual({
        ...created,
        displayName: 'Test User',
        accessLevel: 'FULL',
        createdByName: 'Test User',
      });
    });

    it('returns only the LIMITED fields and none of the personal ones', async () => {
      const [limited] = await service.presentMany(
        companyId,
        viewer(Role.AGENT),
        [otherRegion],
      );

      expect(limited).toEqual({
        id: 'c-other',
        firstName: 'Test',
        lastInitial: 'U.',
        phoneMasked: '+971 50 *** **67',
        regionCode: 'makkah',
        createdBy: 'other-user',
        createdByName: 'other@example.com',
        createdAt: otherRegion.createdAt,
        accessLevel: 'LIMITED',
        accessPending: false,
      });
      for (const field of FORBIDDEN_LIMITED_FIELDS) {
        expect(limited).not.toHaveProperty(field);
      }
      expect(JSON.stringify(limited)).not.toContain('501234567');
    });

    it('runs one users query, one grants query and one pending query per page', async () => {
      await service.presentMany(companyId, viewer(Role.AGENT), page);

      expect(userRepo.find).toHaveBeenCalledTimes(1);
      expect(userRepo.find).toHaveBeenCalledWith({
        where: { id: In(['me', 'other-user']), companyId },
        select: { id: true, name: true, email: true },
      });
      expect(accessRequests.grantedContactIds).toHaveBeenCalledTimes(1);
      expect(accessRepo.find).toHaveBeenCalledTimes(1);
      expect(accessRepo.find).toHaveBeenCalledWith({
        where: {
          companyId,
          requesterId: 'me',
          contactId: In(['c-pending', 'c-own', 'c-other']),
          status: ContactAccessStatus.PENDING,
        },
        select: { id: true, contactId: true },
      });
    });

    it('skips the pending query when every row is FULL', async () => {
      await service.presentMany(companyId, viewer(Role.COMPANY_ADMIN), page);

      expect(accessRepo.find).not.toHaveBeenCalled();
    });

    it('queries nothing for an empty page', async () => {
      expect(
        await service.presentMany(companyId, viewer(Role.AGENT), []),
      ).toEqual([]);
      expect(userRepo.find).not.toHaveBeenCalled();
      expect(accessRequests.grantedContactIds).not.toHaveBeenCalled();
    });
  });
});
