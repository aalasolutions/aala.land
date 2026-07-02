import { helper } from '@ember/component/helper';

export default helper(function UCFirst([name]) {
  if (!name) return '?';
  return String(name).charAt(0).toUpperCase();
});
