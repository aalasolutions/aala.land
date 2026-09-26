import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Contact } from './entities/contact.entity';
import {
  ContactPrivacyService,
  ContactViewer,
} from './contact-privacy.service';
import {
  ContactAccessRequestsService,
  ContactLinkSource,
} from '../contact-access-requests/contact-access-requests.service';
import { Role } from '@shared/enums/roles.enum';

// PENDING: an access request was raised. LIMITED: no FULL and nothing was requested.
export type ContactAttachAccess = 'FULL' | 'PENDING' | 'LIMITED';

// Roles whose assignment of an agent to a lead or unit links that agent to its contact.
const LINKING_ROLES: string[] = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
];

export interface ContactAttachInput {
  companyId: string;
  viewer: ContactViewer | undefined;
  contact: Contact;
  source: ContactLinkSource;
  // Agent the record is assigned to; linked when a MANAGER+ caller set it.
  assigneeId?: string | null;
  linkAssignee: boolean;
  // The caller attached an existing contact to the record themselves.
  agentAttached: boolean;
  verifyPhone?: string | null;
}

// Access side effects of attaching a contact to a lead or a unit; the record is already saved.
@Injectable()
export class ContactAttachService {
  constructor(
    private readonly contactPrivacy: ContactPrivacyService,
    private readonly contactAccessRequests: ContactAccessRequestsService,
  ) {}

  async settle(input: ContactAttachInput): Promise<ContactAttachAccess> {
    const { companyId, viewer, contact, source } = input;
    if (!viewer) return 'LIMITED';

    if (
      input.linkAssignee &&
      LINKING_ROLES.includes(viewer.role) &&
      input.assigneeId &&
      input.assigneeId !== viewer.userId
    ) {
      await this.contactAccessRequests.grantLink(
        companyId,
        contact.id,
        input.assigneeId,
        viewer.userId,
        source,
      );
    }

    const levels = await this.contactPrivacy.accessLevelFor(companyId, viewer, [
      contact,
    ]);
    if (levels.get(contact.id) === 'FULL') return 'FULL';
    if (viewer.role !== (Role.AGENT as string) || !input.agentAttached) {
      return 'LIMITED';
    }

    if (
      input.verifyPhone &&
      (await this.verifyOrMiss(
        companyId,
        contact.id,
        viewer.userId,
        input.verifyPhone,
        source,
      ))
    ) {
      return 'FULL';
    }
    await this.contactAccessRequests.raiseRequest(
      companyId,
      contact.id,
      viewer.userId,
      source,
      null,
    );
    return 'PENDING';
  }

  // The record is already saved, so a rate-limited check counts as a miss instead of failing it.
  private async verifyOrMiss(
    companyId: string,
    contactId: string,
    agentId: string,
    phone: string,
    source: ContactLinkSource,
  ): Promise<boolean> {
    try {
      return await this.contactAccessRequests.verifyPhone(
        companyId,
        contactId,
        agentId,
        phone,
        source,
      );
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === (HttpStatus.TOO_MANY_REQUESTS as number)
      ) {
        return false;
      }
      throw error;
    }
  }
}
