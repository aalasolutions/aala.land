import EmberRouter from '@ember/routing/router';
import config from 'land/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('index', { path: '/' });
  this.route('nuvo');
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
  // Owners is retired as a destination; both legs redirect into Contacts
  // (see routes/owners/index.js, routes/owners/detail.js) so old links and
  // bookmarks still land somewhere real instead of 404ing.
  this.route('owners', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:owner_id' });
  });
  this.route('contacts', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:contact_id' });
  });
  this.route('documents');
  this.route('email-templates');
  this.route('whatsapp');
  this.route('reports');
  this.route('audit');
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
