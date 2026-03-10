import { helper } from '@ember/component/helper';

const ACTIVITY_ICONS = {
  CALL: 'phone',
  EMAIL: 'envelope',
  WHATSAPP: 'whatsapp-logo',
  VIEWING: 'house',
  NOTE: 'note',
  STATUS_CHANGE: 'arrows-clockwise',
  ASSIGNMENT: 'user',
};

export default helper(function getActivityIcon([type]) {
  return ACTIVITY_ICONS[type] || 'push-pin';
});
