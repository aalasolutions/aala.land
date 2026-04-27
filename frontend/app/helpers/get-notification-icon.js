import { helper } from '@ember/component/helper';

const NOTIFICATION_ICONS = {
  LEAD_ASSIGNED: 'user-plus',
  LEAD_UNASSIGNED: 'user-minus',
  LEAD_STATUS_CHANGED: 'arrows-left-right',
  LEASE_EXPIRING: 'timer',
  MAINTENANCE_UPDATE: 'wrench',
  CHEQUE_DUE: 'calendar-blank',
  CHEQUE_BOUNCED: 'warning-circle',
  CHEQUE_OVERDUE: 'clock-countdown',
  CHEQUE_DELAYED: 'hourglass',
  PAYMENT_RECEIVED: 'check-circle',
  SYSTEM: 'info',
};

export default helper(function getNotificationIcon([type]) {
  return NOTIFICATION_ICONS[type] || 'bell';
});
