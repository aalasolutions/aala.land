import { helper } from '@ember/component/helper';

export default helper(function truncateId([id]) {
  if (!id) return '';
  const str = String(id);
  if (str.length <= 8) return str;
  return str.substring(0, 8) + '...';
});
