import { helper } from '@ember/component/helper';

export default helper(function waLink([phone]) {
  if (!phone) return '#';
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleaned}`;
});
