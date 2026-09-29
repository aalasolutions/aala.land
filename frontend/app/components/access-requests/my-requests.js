import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  ACCESS_STATUS_VARIANTS,
  accessExpiryLabel,
} from '../../utils/access-requests';

// The caller's own contact access requests; mine=true keeps approvers to their own rows too.
export default class AccessRequestsMyRequestsComponent extends Component {
  @service auth;

  @tracked requests = [];
  @tracked total = 0;
  @tracked page = 1;
  @tracked limit = 20;
  @tracked isLoading = true;
  @tracked error = '';
  loadToken = 0;

  columns = [
    {
      name: 'Contact',
      valuePath: 'contact.displayName',
      width: 220,
      isFixed: 'left',
    },
    { name: 'Status', valuePath: 'status', width: 130 },
    { name: 'Requested', valuePath: 'createdAt', width: 140, numeric: true },
    { name: 'Decided by', valuePath: 'decidedBy.name', width: 180 },
    { name: 'Decided', valuePath: 'decidedAt', width: 140, numeric: true },
    { name: 'Expires', valuePath: 'expiresAt', width: 140, numeric: true },
    { name: 'Note', valuePath: 'note', width: 240 },
  ];

  constructor() {
    super(...arguments);
    this.load();
  }

  get rows() {
    return this.requests.map((request) => ({
      ...request,
      statusVariant: ACCESS_STATUS_VARIANTS[request.status] ?? 'secondary',
      expiryLabel: accessExpiryLabel(request),
    }));
  }

  async load() {
    const token = ++this.loadToken;
    this.isLoading = true;
    this.error = '';
    const params = new URLSearchParams({
      mine: 'true',
      page: String(this.page),
      limit: String(this.limit),
    });
    try {
      const json = await this.auth.fetchJson(
        `/contact-access-requests?${params.toString()}`,
      );
      if (token !== this.loadToken) return;
      this.requests = json?.data?.data ?? [];
      this.total = json?.data?.total ?? 0;
    } catch (e) {
      if (token !== this.loadToken) return;
      this.requests = [];
      this.total = 0;
      this.error = e.message || 'Could not load your requests';
    } finally {
      if (token === this.loadToken) this.isLoading = false;
    }
  }

  @action
  goToPage(page) {
    this.page = page;
    this.load();
  }

  @action
  previousPage() {
    if (this.page <= 1) return;
    this.goToPage(this.page - 1);
  }

  @action
  nextPage() {
    if (this.page * this.limit >= this.total) return;
    this.goToPage(this.page + 1);
  }

  @action
  setLimit(limit) {
    this.limit = Number(limit) || 20;
    this.page = 1;
    this.load();
  }
}
