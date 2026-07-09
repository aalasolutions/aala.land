import { helper } from '@ember/component/helper';

export default helper(function formatDateTime([date], { withSeconds }) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  if (withSeconds) {
    options.second = '2-digit';
  }

  return d.toLocaleString('en-US', options);
});
