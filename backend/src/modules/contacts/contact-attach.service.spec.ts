import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Role } from '@shared/enums/roles.enum';
import { ContactAttachService } from './contact-attach.service';
import { ContactPrivacyService } from './contact-privacy.service';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';
import { ContactAccessSourceType } from '../contact-access-requests/entities/contact-access-request.entity';
import { Contact } from './entities/contact.entity';

describe('ContactAttachService', () => {
  let service: ContactAttachService;
  let privacy: { accessLevelFor: jest.Mock };
  let accessRequests: {
    grantLink: jest.Mock;
    verifyPhone: jest.Mock;
    raiseRequest: jest.Mock;
  };

  const companyId = 'company-uuid-1';
  const contact = { id: 'contact-1' } as Contact;
  const source = {
    sourceType: ContactAccessSourceType.LEAD,
    sourceId: 'lead-1',
  };
  const agent = { userId: 'agent-1', role: Role.AGENT, regionCodes: [] };
  const manager = {
    userId: 'manager-1',
    role: Role.MANAGER,
    regionCodes: ['dubai'],
  };

  beforeEach(async () => {
    privacy = {
      accessLevelFor: jest
        .fn()
        .mockResolvedValue(new Map([['contact-1', 'LIMITED']])),
    };
    accessRequests = {
      grantLink: jest.fn().mockResolvedValue(undefined),
      verifyPhone: jest.fn(),
      raiseRequest: jest.fn().mockResolvedValue({}),
    };
    const module = await Test.createTestingModule({
      providers: [
        ContactAttachService,
        { provide: ContactPrivacyService, useValue: privacy },
        { provide: ContactAccessRequestsService, useValue: accessRequests },
      ],
    }).compile();
    service = module.get(ContactAttachService);
  });

  const base = { companyId, contact, source, linkAssignee: true };

  it('does nothing without a viewer', async () => {
    expect(
      await service.settle({ ...base, viewer: undefined, agentAttached: true }),
    ).toBe('LIMITED');
    expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
  });

  it('links a different assignee for MANAGER+ only', async () => {
    await service.settle({
      ...base,
      viewer: manager,
      assigneeId: 'agent-2',
      agentAttached: false,
    });
    await service.settle({
      ...base,
      viewer: manager,
      assigneeId: 'manager-1',
      agentAttached: false,
    });
    await service.settle({
      ...base,
      viewer: agent,
      assigneeId: 'agent-2',
      agentAttached: false,
    });

    expect(accessRequests.grantLink).toHaveBeenCalledTimes(1);
    expect(accessRequests.grantLink).toHaveBeenCalledWith(
      companyId,
      'contact-1',
      'agent-2',
      'manager-1',
      source,
    );
  });

  it('never raises a request for a non-agent', async () => {
    expect(
      await service.settle({ ...base, viewer: manager, agentAttached: true }),
    ).toBe('LIMITED');
    expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
  });

  it('returns FULL on a phone match and PENDING with a request on a miss', async () => {
    accessRequests.verifyPhone.mockResolvedValueOnce(true);
    expect(
      await service.settle({
        ...base,
        viewer: agent,
        agentAttached: true,
        verifyPhone: '0501234567',
      }),
    ).toBe('FULL');
    expect(accessRequests.raiseRequest).not.toHaveBeenCalled();

    accessRequests.verifyPhone.mockResolvedValueOnce(false);
    expect(
      await service.settle({
        ...base,
        viewer: agent,
        agentAttached: true,
        verifyPhone: '0500000000',
      }),
    ).toBe('PENDING');
    expect(accessRequests.raiseRequest).toHaveBeenCalledWith(
      companyId,
      'contact-1',
      'agent-1',
      source,
      null,
    );
  });

  it('counts a rate-limited check as a miss but rethrows any other error', async () => {
    accessRequests.verifyPhone.mockRejectedValueOnce(
      new HttpException('Too many', HttpStatus.TOO_MANY_REQUESTS),
    );
    expect(
      await service.settle({
        ...base,
        viewer: agent,
        agentAttached: true,
        verifyPhone: '0500000000',
      }),
    ).toBe('PENDING');

    accessRequests.verifyPhone.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.settle({
        ...base,
        viewer: agent,
        agentAttached: true,
        verifyPhone: '0500000000',
      }),
    ).rejects.toThrow('db down');
  });

  it('skips verification and requests when the agent is already FULL', async () => {
    privacy.accessLevelFor.mockResolvedValue(new Map([['contact-1', 'FULL']]));

    expect(
      await service.settle({
        ...base,
        viewer: agent,
        agentAttached: true,
        verifyPhone: '0501234567',
      }),
    ).toBe('FULL');
    expect(accessRequests.verifyPhone).not.toHaveBeenCalled();
    expect(accessRequests.raiseRequest).not.toHaveBeenCalled();
  });
});
