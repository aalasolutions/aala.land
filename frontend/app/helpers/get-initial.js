import { helper } from '@ember/component/helper';

export default helper(function getInitial([name]) {
  if (!name) return '?';
  return String(name).charAt(0).toUpperCase();
});
