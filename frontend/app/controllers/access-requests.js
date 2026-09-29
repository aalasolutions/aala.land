import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  localDateString,
  localEndOfDayIso,
  timeAgo,
} from '../utils/local-date';
import {
  ACCESS_STATUS_OPTIONS,
  ACCESS_STATUS_VARIANTS,
  accessExpiryLabel,
  accessSourceLabel,
} from '../utils/access-requests';

export const EXPIRY_DEFAULT = 'default';
export const EXPIRY_DATE = 'date';
export const EXPIRY_FOREVER = 'forever';

// Approve sends nothing for the default 90 days, an end-of-day instant for a date, or forever.
export function approvalBody(choice, date) {
  if (choice === EXPIRY_FOREVER) return { forever: true };
  if (choice === EXPIRY_DATE) {
    const expiresAt = localEndOfDayIso(date);
    return expiresAt ? { expiresAt } : null;
  }
  return {};
}

export default class AccessRequestsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

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
    },
    { name: 'Contact', valuePath: 'contact.displayName', width: 200 },
    { name: 'Region', valuePath: 'regionCode', width: 110 },
    { name: 'Source', valuePath: 'sourceType', width: 130 },
    { name: 'Note', valuePath: 'note', width: 220 },
    { name: 'Requested', valuePath: 'createdAt', width: 130, numeric: true },
    { name: 'Decided by', valuePath: 'decidedBy.name', width: 170 },
    { name: 'Expires', valuePath: 'expiresAt', width: 140, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 110,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  @tracked approving = null;
  @tracked expiryChoice = EXPIRY_DEFAULT;
  @tracked expiryDate = '';
  @tracked approveError = '';
  @tracked isApproving = false;

  @tracked deciding = null;
  @tracked decision = null;
  @tracked reason = '';
  @tracked reasonError = '';
  @tracked isDeciding = false;

  get rows() {
    return (this.model?.requests ?? []).map((request) => ({
      ...request,
      statusVariant: ACCESS_STATUS_VARIANTS[request.status] ?? 'secondary',
      sourceLabel: accessSourceLabel(request.sourceType),
      requestedAgo: timeAgo(request.createdAt),
      expiryLabel: accessExpiryLabel(request),
    }));
  }

  get minExpiryDate() {
    return localDateString();
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
  }

  @action openApprove(request) {
    this.approving = request;
    this.expiryChoice = EXPIRY_DEFAULT;
    this.expiryDate = '';
    this.approveError = '';
  }

  @action closeApprove() {
    this.approving = null;
  }

  @action setExpiryChoice(value) {
    this.expiryChoice = value;
    this.approveError = '';
  }

  @action async confirmApprove(event) {
    event?.preventDefault();
    if (!this.approving || this.isApproving) return;
    const body = approvalBody(this.expiryChoice, this.expiryDate);
    if (!body) {
      this.approveError = 'Pick the date the access ends.';
      return;
    }
    this.isApproving = true;
    this.approveError = '';
    try {
      await this.auth.fetchJson(
        `/contact-access-requests/${this.approving.id}/approve`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      this.notifications.success('Access approved');
      this.approving = null;
      this.router.refresh('access-requests');
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
      this.reasonError = 'Reason is required.';
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
    } catch (e) {
      this.reasonError = e.message;
    } finally {
      this.isDeciding = false;
    }
  }
}
