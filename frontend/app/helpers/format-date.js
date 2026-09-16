import { helper } from '@ember/component/helper';
import { formatCalendarDate } from '../utils/local-date';

const OPTIONS = {
  short: { month: 'short', day: 'numeric' },
  medium: { year: 'numeric', month: 'short', day: 'numeric' },
  long: { year: 'numeric', month: 'long', day: 'numeric' },
};

export function formatDate(date, format) {
  return (
    formatCalendarDate(date, 'en-US', OPTIONS[format] || OPTIONS.medium) ?? ''
  );
}

export default helper(function ([date], { format }) {
  return formatDate(date, format);
});
