import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canEditRecord, canViewRecordHistory } from '../../utils/roles';
import { regionNameFor } from '../../utils/region-name';

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
    return canEditRecord(this.auth.currentUser?.role);
  }

  get canViewHistory() {
    return canViewRecordHistory(this.auth.currentUser?.role);
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
