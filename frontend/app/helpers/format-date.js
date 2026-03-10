import { helper } from '@ember/component/helper';

export default helper(function formatDate([date], { format }) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const options = {
    short: { month: 'short', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric' },
  };

  return d.toLocaleDateString('en-US', options[format] || options.medium);
});
