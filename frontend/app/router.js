import EmberRouter from '@ember/routing/router';
import config from 'frontend/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('index', { path: '/' });
  this.route('login');
  this.route('signup');

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
  this.route('whatsapp');
  this.route('team');
  this.route('owners', function () {
    this.route('index', { path: '/' });
    this.route('detail', { path: '/:owner_id' });
  });
  this.route('contacts');
  this.route('documents');
  this.route('email-templates');
  this.route('reports');
  this.route('audit');
  this.route('profile');
  this.route('company');
});
