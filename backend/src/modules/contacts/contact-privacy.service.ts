import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { User } from '../users/entities/user.entity';
import {
  ContactAccessRequest,
  ContactAccessStatus,
} from '../contact-access-requests/entities/contact-access-request.entity';
import { ContactAccessRequestsService } from '../contact-access-requests/contact-access-requests.service';
import { Role } from '@shared/enums/roles.enum';
import {
  RegionScope,
  seesAllRegions,
} from '@shared/utils/region-visibility.util';
import { contactDisplayName } from '@shared/utils/contact.util';
import { lastInitial, maskPhone } from '@shared/utils/contact-privacy.util';
import type { ContactTag } from './contacts.service';

export type ContactAccessLevel = 'FULL' | 'LIMITED';

// The caller a contact is presented to; userId decides creator and grant checks.
export interface ContactViewer extends RegionScope {
  userId: string;
}

export type ContactAccessSubject = Pick<
  Contact,
  'id' | 'regionCode' | 'createdBy'
>;

export type FullContactView = Omit<Contact, 'company'> & {
  displayName: string | null;
  tags?: ContactTag[];
  accessLevel: 'FULL';
  createdByName: string | null;
};

export interface LimitedContactView {
  id: string;
  firstName: string | null;
  lastInitial: string;
  phoneMasked: string | null;
  regionCode: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  accessLevel: 'LIMITED';
  accessPending: boolean;
}

export type PresentedContact = FullContactView | LimitedContactView;

// FULL inside their own regions, LIMITED outside.
const REGION_SCOPED_ROLES: string[] = [
  Role.ADMIN,
  Role.MANAGER,
  Role.ACCOUNTANT,
];

// The one place that decides FULL or LIMITED and strips a contact for the caller.
@Injectable()
export class ContactPrivacyService {
  constructor(
    @InjectRepository(ContactAccessRequest)
    private readonly accessRequestRepository: Repository<ContactAccessRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly contactAccessRequests: ContactAccessRequestsService,
  ) {}

  // No viewer means no identity to check, so everything is LIMITED.
  async accessLevelFor(
    companyId: string,
    viewer: ContactViewer | undefined,
    contacts: ContactAccessSubject[],
  ): Promise<Map<string, ContactAccessLevel>> {
    const levels = new Map<string, ContactAccessLevel>();
    const setAll = (level: ContactAccessLevel) => {
      contacts.forEach((c) => levels.set(c.id, level));
      return levels;
    };
    if (contacts.length === 0) return levels;
    if (!viewer) return setAll('LIMITED');
    if (seesAllRegions(viewer.role)) return setAll('FULL');

    const regionScoped = REGION_SCOPED_ROLES.includes(viewer.role);
    if (!regionScoped && viewer.role !== (Role.AGENT as string)) {
      return setAll('LIMITED');
    }

    // Outside their regions these roles unlock exactly like an agent: creator or grant.
    const regions = viewer.regionCodes ?? [];
    const others: string[] = [];
    for (const c of contacts) {
      const inRegion = regionScoped && regions.includes(c.regionCode);
      if (inRegion || (c.createdBy && c.createdBy === viewer.userId)) {
        levels.set(c.id, 'FULL');
      } else {
        levels.set(c.id, 'LIMITED');
        others.push(c.id);
      }
    }
    if (others.length > 0) {
      const granted = await this.contactAccessRequests.grantedContactIds(
        companyId,
        viewer.userId,
        [...new Set(others)],
      );
      granted.forEach((id) => {
        if (levels.has(id)) levels.set(id, 'FULL');
      });
    }
    return levels;
  }

  // Ids among the given set the user has a PENDING request on; one query per page.
  async pendingContactIds(
    companyId: string,
    userId: string,
    contactIds: string[],
  ): Promise<Set<string>> {
    if (contactIds.length === 0) return new Set();
    const rows = await this.accessRequestRepository.find({
      where: {
        companyId,
        requesterId: userId,
        contactId: In([...new Set(contactIds)]),
        status: ContactAccessStatus.PENDING,
      },
      select: { id: true, contactId: true },
    });
    return new Set(rows.map((r) => r.contactId));
  }

  async presentMany(
    companyId: string,
    viewer: ContactViewer | undefined,
    contacts: Array<Contact & { tags?: ContactTag[] }>,
  ): Promise<PresentedContact[]> {
    if (contacts.length === 0) return [];
    const levels = await this.accessLevelFor(companyId, viewer, contacts);
    const limitedIds = contacts
      .filter((c) => levels.get(c.id) !== 'FULL')
      .map((c) => c.id);

    const [names, pending] = await Promise.all([
      this.creatorNames(companyId, contacts),
      viewer
        ? this.pendingContactIds(companyId, viewer.userId, limitedIds)
        : Promise.resolve(new Set<string>()),
    ]);

    return contacts.map((c) => {
      const createdByName = c.createdBy
        ? (names.get(c.createdBy) ?? null)
        : null;
      if (levels.get(c.id) === 'FULL') {
        return this.fullView(c, createdByName);
      }
      return this.limitedView(c, createdByName, pending.has(c.id));
    });
  }

  async presentOne(
    companyId: string,
    viewer: ContactViewer | undefined,
    contact: Contact & { tags?: ContactTag[] },
  ): Promise<PresentedContact> {
    const [presented] = await this.presentMany(companyId, viewer, [contact]);
    return presented;
  }

  // Same fallback as RecordHistoryService.resolveActorName: name, else email.
  private async creatorNames(
    companyId: string,
    contacts: Contact[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        contacts.map((c) => c.createdBy).filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return new Map();
    const users = await this.userRepository.find({
      where: { id: In(ids), companyId },
      select: { id: true, name: true, email: true },
    });
    return new Map(
      users.map((u) => [u.id, u.name?.trim() || u.email || 'Unknown user']),
    );
  }

  private fullView(
    contact: Contact & { tags?: ContactTag[] },
    createdByName: string | null,
  ): FullContactView {
    const { company, ...rest } = contact;
    void company;
    return {
      ...rest,
      displayName: contactDisplayName(contact),
      accessLevel: 'FULL',
      createdByName,
    };
  }

  private limitedView(
    contact: Contact,
    createdByName: string | null,
    accessPending: boolean,
  ): LimitedContactView {
    return {
      id: contact.id,
      firstName: contact.firstName,
      lastInitial: lastInitial(contact.lastName),
      phoneMasked: maskPhone(contact.phone),
      regionCode: contact.regionCode,
      createdBy: contact.createdBy,
      createdByName,
      createdAt: contact.createdAt,
      accessLevel: 'LIMITED',
      accessPending,
    };
  }
}
