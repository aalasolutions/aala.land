import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';

const PAGE_LIMIT = 10;

const ACTION_LABELS = {
  DELETE: 'Deleted',
  ARCHIVE: 'Archived',
  UNARCHIVE: 'Unarchived',
  CANCEL: 'Cancelled',
  REPLACE: 'Replaced',
  BOUNCE: 'Bounced',
  STATUS_CHANGE: 'Status changed',
  TERMINATE: 'Terminated',
  DEACTIVATE: 'Deactivated',
  REACTIVATE: 'Reactivated',
};

const ACTION_VARIANTS = {
  DELETE: 'danger',
  CANCEL: 'danger',
  BOUNCE: 'danger',
  TERMINATE: 'danger',
  DEACTIVATE: 'danger',
  ARCHIVE: 'warning',
  REPLACE: 'warning',
  UNARCHIVE: 'success',
  REACTIVATE: 'success',
  STATUS_CHANGE: 'info',
};

export default class RecordHistoryListComponent extends Component {
  @service auth;

  @tracked entries = [];
  @tracked total = 0;
  @tracked page = 1;
  @tracked isLoading = true;
  @tracked errorMessage = '';

  limit = PAGE_LIMIT;
  requestId = 0;

  constructor(owner, args) {
    super(owner, args);
    this.reloadKey = args.reloadKey;
    this.reloadEntityType = args.entityType;
    this.reloadEntityId = args.entityId;
    this.fetchPage(1);
  }

  get rows() {
    return this.entries.map((entry) => ({
      ...entry,
      actionLabel: ACTION_LABELS[entry.action] ?? entry.action,
      actionVariant: ACTION_VARIANTS[entry.action] ?? 'secondary',
    }));
  }

  get hasPages() {
    return this.total > this.limit;
  }

  @action goToPage(page) {
    this.fetchPage(page);
  }

  // Refetch when @reloadKey, @entityType or @entityId changes.
  reloadOn = modifier((element, [key, entityType, entityId]) => {
    if (
      key === this.reloadKey &&
      entityType === this.reloadEntityType &&
      entityId === this.reloadEntityId
    ) {
      return;
    }
    this.reloadKey = key;
    this.reloadEntityType = entityType;
    this.reloadEntityId = entityId;
    this.fetchPage(1);
  });

  async fetchPage(page) {
    const requestId = ++this.requestId;
    // Leave the render pass before touching tracked state.
    await Promise.resolve();

    const { entityType, entityId } = this.args;
    if (requestId !== this.requestId) {
      return;
    }
    if (!entityType || !entityId) {
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const params = new URLSearchParams({
      entityType,
      entityId,
      page: String(page),
      limit: String(this.limit),
    });

    try {
      const json = await this.auth.fetchJson(
        `/record-history?${params.toString()}`,
      );
      if (requestId !== this.requestId) return;
      this.entries = json?.data?.data ?? [];
      this.total = json?.data?.total ?? 0;
      this.page = page;
    } catch (e) {
      if (requestId !== this.requestId) return;
      this.entries = [];
      this.total = 0;
      this.errorMessage =
        e.status === 403
          ? 'You do not have permission to view history.'
          : e.message || 'Failed to load history';
    } finally {
      if (requestId === this.requestId) {
        this.isLoading = false;
      }
    }
  }
}
