import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';

export default class SettingsWhatsappRoute extends AuthenticatedRoute {
  @service router;
  @service auth;
  @service whatsapp;

  async beforeModel(transition) {
    await super.beforeModel(transition);

    if (this.auth.currentUser?.role !== 'company_admin') {
      return this.router.transitionTo('dashboard');
    }
  }

  async model() {
    try {
      const json = await this.whatsapp.getSettings();
      return { aiPrompt: json?.data?.aiPrompt ?? json?.aiPrompt ?? null };
    } catch {
      return { aiPrompt: null };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.aiPrompt = model?.aiPrompt ?? '';
    controller.successMsg = '';
    controller.errorMsg = '';
  }
}
