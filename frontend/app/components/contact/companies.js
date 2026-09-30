import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';

// Company names in the active region with how many contacts each has.
export default class ContactCompaniesComponent extends Component {
  @service auth;
  @service region;

  @tracked companies = [];
  @tracked total = 0;
  @tracked page = 1;
  @tracked limit = 20;
  @tracked isLoading = true;
  @tracked error = '';
  loadToken = 0;
  regionCode = this.region.regionCode;

  columns = [
    { name: 'Company', valuePath: 'name', width: 320, isFixed: 'left' },
    { name: 'People', valuePath: 'count', width: 140, numeric: true, isFixed: 'right' },
  ];

  constructor() {
    super(...arguments);
    this.load(1);
  }

  // A region switch refreshes the route without re-creating this component.
  reloadOnRegion = modifier((element, [regionCode]) => {
    if (regionCode === this.regionCode) return;
    this.regionCode = regionCode;
    this.load(1);
  });

  async load(page) {
    const token = ++this.loadToken;
    // Leave the render pass before touching tracked state.
    await Promise.resolve();
    if (token !== this.loadToken) return;
    this.page = page;
    this.isLoading = true;
    this.error = '';
    const params = new URLSearchParams({
      page: String(page),
      limit: String(this.limit),
    });
    try {
      const json = await this.auth.fetchJson(
        `/contacts/companies?${params.toString()}`,
      );
      if (token !== this.loadToken) return;
      this.companies = json?.data?.data ?? [];
      this.total = json?.data?.total ?? 0;
    } catch (e) {
      if (token !== this.loadToken) return;
      this.companies = [];
      this.total = 0;
      this.error = e.message || 'Could not load companies';
    } finally {
      if (token === this.loadToken) this.isLoading = false;
    }
  }

  @action
  goToPage(page) {
    this.load(page);
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
    this.load(1);
  }
}
