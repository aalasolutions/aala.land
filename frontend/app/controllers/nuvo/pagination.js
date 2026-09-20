import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoPaginationController extends Controller {
  @tracked page = 1;
  @tracked limit = 50;
  @tracked smallPage = 2;
  @tracked compactPage = 3;
  @tracked stepPage = 1;

  total = 430;
  smallTotal = 87;

  @action
  setPage(page) {
    this.page = page;
  }

  @action
  setLimit(limit) {
    this.limit = limit;
    this.page = 1;
  }

  @action
  setSmallPage(page) {
    this.smallPage = page;
  }

  @action
  setCompactPage(page) {
    this.compactPage = page;
  }

  @action
  stepPrevious() {
    this.stepPage = Math.max(1, this.stepPage - 1);
  }

  @action
  stepNext() {
    this.stepPage = Math.min(9, this.stepPage + 1);
  }

  code = {
    basic: `<Nuvo::Pagination @page={{this.page}} @limit={{this.limit}} @total={{this.total}} @onPageChange={{this.setPage}} />`,
    perPage: `<Nuvo::Pagination
  @page={{this.page}}
  @limit={{this.limit}}
  @total={{this.total}}
  @onPageChange={{this.setPage}}
  @onLimitChange={{this.setLimit}}
/>

{{! per-page choices default to 50, 100 and 250 }}`,
    perPageOptions: `<Nuvo::Pagination
  @page={{this.smallPage}}
  @perPage={{10}}
  @total={{this.smallTotal}}
  @perPageOptions={{array 10 20 30}}
  @onPageChange={{this.setSmallPage}}
  @onPerPageChange={{this.setSmallLimit}}
  @sm={{true}}
/>`,
    compact: `<Nuvo::Pagination @page={{this.compactPage}} @perPage={{10}} @total={{240}} @onPageChange={{this.setCompactPage}} @compact={{true}} />`,
    steps: `<Nuvo::Pagination
  @page={{this.stepPage}}
  @perPage={{10}}
  @total={{90}}
  @onPrevious={{this.stepPrevious}}
  @onNext={{this.stepNext}}
  @onPageChange={{this.setStepPage}}
/>`,
    empty: `<Nuvo::Pagination @page={{1}} @perPage={{50}} @total={{0}} @onPageChange={{this.setPage}} />`,
  };

  argRows = [
    { name: '@page', type: 'number', default: '1', description: 'Current page, 1-based.' },
    { name: '@perPage', type: 'number', default: '50', description: 'Rows per page. @limit is accepted as an alias and is what the app\'s paginated controllers pass.' },
    { name: '@total', type: 'number', default: '0', description: 'Total row count; drives the page list and the status text.' },
    { name: '@perPageOptions', type: 'array', default: '[50, 100, 250]', description: 'Choices in the per-page select.' },
    { name: '@selectId', type: 'string', default: '', description: 'Id for the per-page select; generated per instance when omitted.' },
    { name: '@sm', type: 'boolean', default: 'false', description: 'Smaller controls.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter spacing.' },
  ];

  callbackRows = [
    { name: '@onPageChange', signature: '(page)', description: 'A page number, previous or next was chosen. Only valid whole pages inside range are reported.' },
    { name: '@onPerPageChange', signature: '(perPage)', description: 'Per-page select changed. Passing it renders the select. @onLimitChange is an alias.' },
    { name: '@onPrevious', signature: '()', description: 'Overrides the previous step for controllers without a page-number model.' },
    { name: '@onNext', signature: '()', description: 'Overrides the next step.' },
  ];

  @action
  setSmallLimit() {
    this.smallPage = 1;
  }

  @action
  setStepPage(page) {
    this.stepPage = page;
  }
}
