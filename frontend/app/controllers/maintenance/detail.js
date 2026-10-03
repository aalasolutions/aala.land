import Controller from '@ember/controller';

export default class MaintenanceDetailController extends Controller {
  get workOrder() {
    return this.model?.workOrder ?? null;
  }

  get title() {
    return this.workOrder?.title || 'Work Order';
  }

  get documentFilters() {
    return { workOrderId: this.workOrder?.id };
  }

  get presetLink() {
    const order = this.workOrder;
    if (!order) return null;
    return { type: 'work_order', id: order.id, label: order.title ?? '' };
  }
}
