import { helper } from '@ember/component/helper';

export default helper(function lowercase([string]) {
  if (!string) return '';
  return String(string).toLowerCase();
});
