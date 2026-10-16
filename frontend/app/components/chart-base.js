import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { service } from '@ember/service';
import { formatCalendarDate, formatCalendarRange } from '../utils/local-date';
import { compactFormatter, moneyFormatter } from '../utils/chart-style';
import { localeForRegion } from '../utils/locale';

// Shared by the chart components: locale, region currency formatter and bucket labels.
export default class ChartBaseComponent extends Component {
  @service region;

  get locale() {
    return localeForRegion(this.region.activeRegion);
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
    const todayZone = this.region.activeRegion?.timezone;
    return points.map((point) => {
      if (point.month) {
        return (
          formatCalendarDate(`${point.month}-01`, locale, {
            month: 'short',
          }) ?? point.month
        );
      }
      return (
        formatCalendarRange(point.from, point.to, locale, { todayZone }) ?? ''
      );
    });
  }
}
