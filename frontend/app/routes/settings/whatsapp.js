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
      const [settings, ai] = await Promise.all([
        this.whatsapp.getSettings(),
        this.whatsapp.getAi(),
      ]);
      const aiData = ai?.data ?? ai;
      return {
        aiPrompt: settings?.data?.aiPrompt ?? settings?.aiPrompt ?? null,
        weeklyLimit: aiData?.weeklyLimit ?? null,
        weeklyUsed: aiData?.weeklyUsed ?? null,
        weeklyResetsAt: aiData?.weeklyResetsAt ?? null,
      };
    } catch {
      return { aiPrompt: null, weeklyLimit: null, weeklyUsed: null, weeklyResetsAt: null };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.aiPrompt = model?.aiPrompt ?? '';
    controller.weeklyLimit = model?.weeklyLimit ?? null;
    controller.weeklyUsed = model?.weeklyUsed ?? null;
    controller.weeklyResetsAt = model?.weeklyResetsAt ?? null;
    controller.successMsg = '';
    controller.errorMsg = '';
  }
}
