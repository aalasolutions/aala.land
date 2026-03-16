import { helper } from '@ember/component/helper';

export default helper(function formatRole([role]) {
  if (!role) return '';
  return String(role)
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
});
