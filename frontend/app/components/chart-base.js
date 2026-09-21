import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { service } from '@ember/service';
import {
  formatCalendarDate,
  formatCalendarRange,
  toEpochMs,
} from '../utils/local-date';
import { compactFormatter, moneyFormatter } from '../utils/chart-style';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Past a year of series, two buckets can read alike unless the label names the year.
const AMBIGUOUS_AFTER_DAYS = 365;

// Shared by the chart components: locale, region currency formatter and bucket labels.
export default class ChartBaseComponent extends Component {
  @service region;

  get locale() {
    return navigator.language || 'en';
  }

  // Builds the Intl.NumberFormat once per locale/currency pair, not per row or tooltip frame.
  @cached
  get money() {
    return moneyFormatter(this.locale, this.region.currencyCode);
  }

  // Axis ticks read this on every config build, so the formatter is built once per locale.
  @cached
  get compact() {
    return compactFormatter(this.locale);
  }

  // A month point reads as its month name; a point holding bounds reads as the span it covers.
  pointLabels(points) {
    const locale = this.locale;
    const spans = points.filter((point) => point.from && point.to);
    const first = spans[0];
    const last = spans[spans.length - 1];
    const total = first
      ? (toEpochMs(last.to) - toEpochMs(first.from)) / MS_PER_DAY
      : 0;
    const spanFormat = {
      ...(total > AMBIGUOUS_AFTER_DAYS ? { year: 'numeric' } : {}),
      month: 'short',
      day: 'numeric',
    };
    return points.map((point) => {
      if (point.month) {
        return (
          formatCalendarDate(`${point.month}-01`, locale, {
            month: 'short',
          }) ?? point.month
        );
      }
      return (
        formatCalendarRange(point.from, point.to, locale, spanFormat) ?? ''
      );
    });
  }
}
