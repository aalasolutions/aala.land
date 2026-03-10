import { helper } from '@ember/component/helper';

export default helper(function capitalize([string]) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
});
