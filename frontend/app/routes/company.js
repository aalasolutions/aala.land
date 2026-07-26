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
      billingHistoryResult,
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
            safeJson(this.auth, '/whatsapp/ai/credits', 'COMPANY'),
          ])
        : Promise.resolve(null),
      isCompanyAdmin
        ? safeJson(this.auth, '/billing/subscription', 'COMPANY')
        : Promise.resolve(null),
      isCompanyAdmin
        ? safeJson(this.auth, '/billing/history?page=1&limit=10', 'COMPANY')
        : Promise.resolve(null),
    ]);

    const company = companyResult.data || null;
    const regionsData = regionsResponse.data || regionsResponse || {};
    const regions = regionsData.flat || regionsData || [];
    const groupedRegions = regionsData.grouped || [];

    let ai = {
      aiPrompt: null,
      creditsLimit: null,
      creditsUsed: null,
      creditsResetsAt: null,
      creditAgents: [],
    };
    if (aiSettings) {
      const [settings, aiData, creditsData] = aiSettings;
      const aiInfo = aiData?.data ?? aiData;
      const credits = creditsData?.data ?? creditsData;
      ai = {
        aiPrompt: settings?.data?.aiPrompt ?? settings?.aiPrompt ?? null,
        creditsLimit: aiInfo?.creditsLimit ?? null,
        creditsUsed: aiInfo?.creditsUsed ?? null,
        creditsResetsAt: aiInfo?.creditsResetsAt ?? null,
        creditAgents: credits?.agents ?? [],
      };
    }

    return {
      company,
      regions,
      groupedRegions,
      storageUsage,
      ai,
      billing: billingResult,
      billingHistory: billingHistoryResult,
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
    controller.storageUsage = model?.storageUsage?.data ?? null;
    controller.billing = model?.billing?.data ?? null;
    const history = model?.billingHistory?.data ?? null;
    controller.billingHistory = history?.data ?? [];
    controller.billingHistoryTotal = history?.total ?? 0;
    controller.billingHistoryPage = history?.page ?? 1;
    controller.billingHistoryLimit = history?.limit ?? 10;
    controller.activeTab = 'general';
    controller.aiPrompt = model?.ai?.aiPrompt ?? '';
    controller.creditsLimit = model?.ai?.creditsLimit ?? null;
    controller.creditsUsed = model?.ai?.creditsUsed ?? null;
    controller.creditsResetsAt = model?.ai?.creditsResetsAt ?? null;
    controller.creditAgents = model?.ai?.creditAgents ?? [];
    controller.aiSuccessMsg = '';
    controller.aiErrorMsg = '';
  }
}
