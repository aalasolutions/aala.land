import EmberRouter from '@embroider/router';
import config from 'land/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('index', { path: '/' });
  // Public component documentation; one child route per component family.
  this.route('nuvo', function () {
    this.route('internals');
    this.route('shell');
    this.route('typography');
    this.route('utilities');
    this.route('table');
    this.route('code');
    this.route('button');
    this.route('badge');
    this.route('tag');
    this.route('avatar');
    this.route('indicators');
    this.route('divider');
    this.route('input');
    this.route('checkbox');
    this.route('field');
    this.route('card');
    this.route('panel');
    this.route('list');
    this.route('page-header');
    this.route('accordion');
    this.route('tabs');
    this.route('segmented');
    this.route('breadcrumb');
    this.route('pagination');
    this.route('alert');
    this.route('progress');
    this.route('empty-state');
    this.route('timeline');
    this.route('dropdown');
    this.route('popover');
    this.route('tooltip');
    this.route('modal');
    this.route('confirm');
    this.route('drawer');
  });
  this.route('login');
  this.route('signup');
  this.route('accept-invite');
  this.route('reset-password');

  this.route('dashboard');
  this.route('properties', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:area_id' });
    this.route('unit', { path: '/:area_id/unit/:unit_id' });
  });
  this.route('leads');
  this.route('financials');
  this.route('commissions');
  this.route('leases');
  this.route('maintenance');
  this.route('vendors');
  this.route('cheques');
  this.route('team');
  // Retired Owners routes redirect into Contacts so old links and bookmarks do not 404.
  this.route('owners', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:owner_id' });
  });
  this.route('contacts', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:contact_id' });
  });
  this.route('access-requests');
  // Development-only DataTable option showcase, a copy of the contacts list.
  this.route('table-options');
  this.route('documents');
  this.route('email-templates');
  this.route('whatsapp');
  this.route('reports');
  this.route('audit');
  this.route('history');
  this.route('profile');
  this.route('company');
  this.route('billing', function () {
    this.route('success');
    this.route('cancel');
  });
  this.route('admin', function () {
    this.route('overview');
    this.route('companies', function () {
      this.route('company', { path: '/:company_id' });
    });
    this.route('marketers');
    this.route('system');
  });
});
