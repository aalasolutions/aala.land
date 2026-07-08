import AuthenticatedRoute from './authenticated';
import { service } from '@ember/service';
import { safeJson } from '../utils/safe-json';

export default class CompanyRoute extends AuthenticatedRoute {
  @service auth;
  @service region;
  @service whatsapp;

  async model() {
    if (this.auth.currentUser?.role === 'super_admin') return null;
    const companyId = this.auth.currentUser?.companyId;
    if (!companyId) return null;

    const isCompanyAdmin = this.auth.currentUser?.role === 'company_admin';

    const [
      companyResult,
      regionsResponse,
      storageUsage,
      aiSettings,
      billingResult,
    ] = await Promise.all([
      this.auth.fetchJson(`/companies/${companyId}`),
      fetch(`${this.auth.apiBase}/companies/regions`)
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      safeJson(this.auth, `/companies/${companyId}/storage-usage`, 'COMPANY'),
      isCompanyAdmin
        ? Promise.all([
            this.whatsapp.getSettings().catch(() => null),
            this.whatsapp.getAi().catch(() => null),
          ])
        : Promise.resolve(null),
      isCompanyAdmin
        ? safeJson(this.auth, '/billing/subscription', 'COMPANY')
        : Promise.resolve(null),
    ]);

    const company = companyResult.data || null;
    const regionsData = regionsResponse.data || regionsResponse || {};
    const regions = regionsData.flat || regionsData || [];
    const groupedRegions = regionsData.grouped || [];

    let ai = {
      aiPrompt: null,
      weeklyLimit: null,
      weeklyUsed: null,
      weeklyResetsAt: null,
    };
    if (aiSettings) {
      const [settings, aiData] = aiSettings;
      const aiInfo = aiData?.data ?? aiData;
      ai = {
        aiPrompt: settings?.data?.aiPrompt ?? settings?.aiPrompt ?? null,
        weeklyLimit: aiInfo?.weeklyLimit ?? null,
        weeklyUsed: aiInfo?.weeklyUsed ?? null,
        weeklyResetsAt: aiInfo?.weeklyResetsAt ?? null,
      };
    }

    return {
      company,
      regions,
      groupedRegions,
      storageUsage,
      ai,
      billing: billingResult,
    };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    const c = model?.company;
    if (c) {
      controller.formName = c.name || '';
      controller.formActiveRegions = c.activeRegions || [];
      controller.formDefaultRegionCode = c.defaultRegionCode || null;
    }
    controller.storageUsage = model.storageUsage?.data ?? null;
    controller.billing = model.billing?.data ?? null;
    controller.activeTab = 'general';
    controller.aiPrompt = model?.ai?.aiPrompt ?? '';
    controller.weeklyLimit = model?.ai?.weeklyLimit ?? null;
    controller.weeklyUsed = model?.ai?.weeklyUsed ?? null;
    controller.weeklyResetsAt = model?.ai?.weeklyResetsAt ?? null;
    controller.aiSuccessMsg = '';
    controller.aiErrorMsg = '';
  }
}
