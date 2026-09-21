import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { service } from '@ember/service';
import { formatCalendarDate } from '../utils/local-date';
import { compactFormatter, moneyFormatter } from '../utils/chart-style';

// Shared by the chart components: locale, region currency formatter and month labels.
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

  // Turns 'YYYY-MM' points into short month names, keeping the raw month when it cannot be parsed.
  monthLabels(points) {
    const locale = this.locale;
    return points.map(
      (point) =>
        formatCalendarDate(`${point.month}-01`, locale, {
          month: 'short',
        }) ?? point.month,
    );
  }
}
