import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AdminMarketersController extends Controller {
  @tracked expanded = null;

  get rows() {
    return (this.model.rows ?? []).map((row) => ({
      ...row,
      code: row.marketerCode ?? '(none)',
      key: row.marketerCode ?? '__none__',
      companies: row.companies,
      companyLinks: (row.companyIds ?? []).map((id) => ({
        id,
        name: this.model.companyNames[id] ?? id,
      })),
    }));
  }

  @action
  toggle(key) {
    this.expanded = this.expanded === key ? null : key;
  }

  isExpanded(key) {
    return this.expanded === key;
  }
}
