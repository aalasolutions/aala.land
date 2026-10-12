import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { ROLES } from '../../utils/roles';
import { regionNameFor } from '../../utils/region-name';

// Same roles as PATCH /maintenance/:id.
const EDIT_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

// Same roles as GET /record-history.
const HISTORY_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];

export default class MaintenanceDetailController extends Controller {
  @service auth;
  @service region;
  @service router;

  @tracked showEdit = false;

  get workOrder() {
    return this.model?.workOrder ?? null;
  }

  get title() {
    return this.workOrder?.title || 'Work Order';
  }

  get subtitle() {
    const parts = [
      this.model?.unit?.label,
      regionNameFor(this.region.regions, this.workOrder?.regionCode),
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Work order';
  }

  get canEdit() {
    return EDIT_ROLES.includes(this.auth.currentUser?.role);
  }

  get canViewHistory() {
    return HISTORY_ROLES.includes(this.auth.currentUser?.role);
  }

  get documentFilters() {
    return { workOrderId: this.workOrder?.id };
  }

  get presetLink() {
    const order = this.workOrder;
    if (!order) return null;
    return { type: 'work_order', id: order.id, label: order.title ?? '' };
  }

  @action openEdit() {
    this.showEdit = true;
  }

  @action closeEdit() {
    this.showEdit = false;
  }

  @action refresh() {
    this.router.refresh('maintenance.detail');
  }
}
