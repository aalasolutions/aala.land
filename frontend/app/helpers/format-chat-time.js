import { helper } from '@ember/component/helper';
import {
  addCalendarDays,
  formatInstant,
  localDateString,
} from '../utils/local-date';

const LOCALE = 'en-US';
const TIME = { hour: 'numeric', minute: '2-digit' };
const WEEKDAY = { weekday: 'long' };
const SAME_YEAR = { month: 'short', day: 'numeric' };
const OTHER_YEAR = { year: 'numeric', month: 'short', day: 'numeric' };

// Chat list stamp on browser calendar days: time today, Yesterday, weekday within six days, then a date.
export function formatChatTime(value, now = Date.now()) {
  if (!value) return '';
  const day = localDateString(value);
  const today = localDateString(now);
  if (!day || !today) return '';

  let options;
  // A stamp ahead of the minute clock (clock lag or skew) still reads as today.
  if (day >= today) options = TIME;
  else if (day === addCalendarDays(today, -1)) return 'Yesterday';
  else if (day >= addCalendarDays(today, -6)) options = WEEKDAY;
  else if (day.slice(0, 4) === today.slice(0, 4)) options = SAME_YEAR;
  else options = OTHER_YEAR;

  return formatInstant(value, LOCALE, options) ?? '';
}

export default helper(function ([value], { now }) {
  return formatChatTime(value, now ?? Date.now());
});
