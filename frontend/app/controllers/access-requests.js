import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import CellText from '@wovenui/ember/components/woven/cell/text';
import CellLink from '@wovenui/ember/components/woven/cell/link';
import CellPerson from '@wovenui/ember/components/woven/cell/person';
import CellStatus from 'land/components/cell/status';
import { localEndOfDayIso, timeAgo, todayInZone } from '../utils/local-date';
import {
  ACCESS_STATUS_OPTIONS,
  accessExpiryLabel,
  accessSourceLabel,
} from '../utils/access-requests';

export const EXPIRY_DEFAULT = 'default';
export const EXPIRY_DATE = 'date';
export const EXPIRY_FOREVER = 'forever';

// Approve sends nothing for the default 90 days, an end-of-day instant in timeZone for a date, or forever.
export function approvalBody(choice, date, timeZone = null) {
  if (choice === EXPIRY_FOREVER) return { forever: true };
  if (choice === EXPIRY_DATE) {
    const expiresAt = localEndOfDayIso(date, timeZone);
    return expiresAt ? { expiresAt } : null;
  }
  return {};
}

export default class AccessRequestsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;
  @service accessRequests;
  @service region;

  queryParams = ['page', 'limit', 'status'];
  @tracked status = 'PENDING';

  statusOptions = ACCESS_STATUS_OPTIONS;

  expiryChoices = [
    { value: EXPIRY_DEFAULT, label: '90 days' },
    { value: EXPIRY_DATE, label: 'Until a date' },
    { value: EXPIRY_FOREVER, label: 'Forever' },
  ];

  columns = [
    {
      name: 'Requester',
      valuePath: 'requester.name',
      width: 180,
      isFixed: 'left',
      cell: CellPerson,
      stackedLabel: false,
    },
    {
      name: 'Contact',
      valuePath: 'contact.displayName',
      width: 200,
      cell: CellLink,
      cellArgs: { route: 'contacts.detail', modelPath: 'contact.id' },
    },
    { name: 'Region', valuePath: 'regionCode', width: 110, cell: CellText },
    { name: 'Source', valuePath: 'sourceLabel', width: 130, cell: CellText },
    { name: 'Note', valuePath: 'note', width: 220, cell: CellText },
    {
      name: 'Status',
      valuePath: 'status',
      width: 130,
      cell: CellStatus,
      cellArgs: { domain: 'accessRequest' },
    },
    { name: 'Requested', valuePath: 'createdAt', width: 130 },
    {
      name: 'Decided by',
      valuePath: 'decidedBy.name',
      width: 170,
      cell: CellPerson,
    },
    { name: 'Expires', valuePath: 'expiresAt', width: 140 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isSortable: false,
      isResizable: false,
      stackedLabel: false,
    },
  ];

  @tracked approving = null;
  @tracked expiryChoice = EXPIRY_DEFAULT;
  @tracked expiryDate = '';
  @tracked approveError = '';
  @tracked expiryDateError = '';
  @tracked isApproving = false;

  @tracked deciding = null;
  @tracked decision = null;
  @tracked reason = '';
  @tracked reasonError = '';
  @tracked isDeciding = false;

  get rows() {
    return (this.model?.requests ?? []).map((request) => ({
      ...request,
      sourceLabel: accessSourceLabel(request.sourceType),
      requestedAgo: timeAgo(request.createdAt),
      expiryLabel: accessExpiryLabel(request),
    }));
  }

  get minExpiryDate() {
    return todayInZone(this.region.activeRegion?.timezone);
  }

  get showApproveModal() {
    return Boolean(this.approving);
  }

  get showDecisionModal() {
    return Boolean(this.deciding);
  }

  get decisionTitle() {
    return this.decision === 'revoke' ? 'Revoke access' : 'Reject request';
  }

  get decisionConfirmText() {
    return this.decision === 'revoke' ? 'Revoke' : 'Reject';
  }

  get decisionMessage() {
    const name = this.deciding?.requester?.name ?? 'the requester';
    const contact = this.deciding?.contact?.displayName ?? 'this contact';
    return this.decision === 'revoke'
      ? `Revoke ${name}'s access to ${contact}? They go back to limited details.`
      : `Reject ${name}'s request for ${contact}?`;
  }

  @action setStatus(value) {
    this.status = value;
    this.page = 1;
  }

  @action setFieldValue(field, value) {
    this[field] = value;
    if (field === 'expiryDate') this.expiryDateError = '';
    if (field === 'reason') this.reasonError = '';
  }

  @action openApprove(request) {
    this.approving = request;
    this.expiryChoice = EXPIRY_DEFAULT;
    this.expiryDate = '';
    this.approveError = '';
    this.expiryDateError = '';
  }

  @action closeApprove() {
    this.approving = null;
  }

  @action setExpiryChoice(value) {
    this.expiryChoice = value;
    this.approveError = '';
    this.expiryDateError = '';
  }

  @action async confirmApprove(event) {
    event?.preventDefault();
    if (!this.approving || this.isApproving) return;
    const body = approvalBody(
      this.expiryChoice,
      this.expiryDate,
      this.region.activeRegion?.timezone,
    );
    if (!body) {
      this.approveError = '';
      this.expiryDateError = 'Choose the date the access ends';
      return;
    }
    this.isApproving = true;
    this.approveError = '';
    this.expiryDateError = '';
    try {
      await this.auth.fetchJson(
        `/contact-access-requests/${this.approving.id}/approve`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      this.notifications.success('Access approved');
      this.approving = null;
      this.router.refresh('access-requests');
      this.accessRequests.loadPendingCount();
    } catch (e) {
      this.approveError = e.message;
    } finally {
      this.isApproving = false;
    }
  }

  @action openDecision(decision, request) {
    this.decision = decision;
    this.deciding = request;
    this.reason = '';
    this.reasonError = '';
  }

  @action closeDecision() {
    this.deciding = null;
    this.decision = null;
  }

  @action async confirmDecision() {
    if (!this.deciding || this.isDeciding) return;
    const reason = this.reason.trim();
    if (!reason) {
      this.reasonError = 'Enter a reason';
      return;
    }
    const decision = this.decision;
    this.isDeciding = true;
    this.reasonError = '';
    try {
      await this.auth.fetchJson(
        `/contact-access-requests/${this.deciding.id}/${decision}`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      );
      this.notifications.success(
        decision === 'revoke' ? 'Access revoked' : 'Request rejected',
      );
      this.closeDecision();
      this.router.refresh('access-requests');
      this.accessRequests.loadPendingCount();
    } catch (e) {
      this.reasonError = e.message;
    } finally {
      this.isDeciding = false;
    }
  }
}
