import AuthenticatedRoute from '../authenticated';
import { service } from '@ember/service';
import { fetchUnitSummary } from '../../utils/unit-summary';
import { canManageUsers } from '../../utils/roles';

export default class MaintenanceDetailRoute extends AuthenticatedRoute {
  @service auth;

  async model({ work_order_id }) {
    const orderResult = await this.auth
      .fetchJson(`/maintenance/${work_order_id}`)
      .catch(() => null);
    const workOrder = orderResult?.data || null;

    // The read carries bare ids, and GET /users/:id is open only to the user-management roles.
    const canReadAssignee =
      Boolean(workOrder?.assignedTo) &&
      canManageUsers(this.auth.currentUser?.role);
    const [unit, vendorResult, assigneeResult] = await Promise.all([
      fetchUnitSummary(this.auth, workOrder?.unitId),
      workOrder?.vendorId
        ? this.auth
            .fetchJson(`/vendors/${workOrder.vendorId}`)
            .catch(() => null)
        : null,
      canReadAssignee
        ? this.auth
            .fetchJson(`/users/${workOrder.assignedTo}`)
            .catch(() => null)
        : null,
    ]);

    return {
      workOrder,
      unit,
      vendor: vendorResult?.data || null,
      assignee: assigneeResult?.data || null,
    };
  }
}
