import { helper } from '@ember/component/helper';
import {
  addCalendarDays,
  formatInstant,
  formatShortDate,
  localDateString,
} from '../utils/local-date';

const LOCALE = 'en-US';
const TIME = { hour: 'numeric', minute: '2-digit' };
const WEEKDAY = { weekday: 'long' };

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
  else return formatShortDate(value, { locale: LOCALE, now }) ?? '';

  return formatInstant(value, LOCALE, options) ?? '';
}

export default helper(function ([value], { now }) {
  return formatChatTime(value, now ?? Date.now());
});
