import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { validPage } from 'land/utils/page-number';
import {
  HISTORY_ACTIONS,
  HISTORY_ACTION_VARIANTS as ACTION_VARIANTS,
  optionLabelFor,
} from 'land/constants';

const PAGE_LIMIT = 50;

export default class RecordHistoryListComponent extends Component {
  @service auth;

  @tracked entries = [];
  @tracked total = 0;
  @tracked page = 1;
  @tracked isLoading = true;
  @tracked errorMessage = '';

  limit = PAGE_LIMIT;
  requestId = 0;

  columns = [
    { name: 'Action', valuePath: 'actionLabel', width: 160, isFixed: 'left' },
    { name: 'Record', valuePath: 'entityTitle', width: 220 },
    { name: 'Reason', valuePath: 'reason', width: 220 },
    { name: 'By', valuePath: 'actorName', width: 180 },
    { name: 'Date', valuePath: 'createdAt', width: 180 },
  ];

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
      actionLabel: optionLabelFor(HISTORY_ACTIONS, entry.action),
      actionVariant: ACTION_VARIANTS[entry.action] ?? 'secondary',
    }));
  }

  get hasPages() {
    return this.total > this.limit;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  @action goToPage(page) {
    const target = validPage(page, this.totalPages);
    if (target === null) return;
    this.fetchPage(target);
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

    // Everything past this point is inside the try, so no caller can leak a rejection.
    try {
      const params = new URLSearchParams({
        entityType,
        entityId,
        page: String(page),
        limit: String(this.limit),
      });
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
