import Component from '@glimmer/component';
import { service } from '@ember/service';
import { formatCalendarDate } from '../utils/local-date';
import { moneyFormatter, token, withAlpha } from '../utils/chart-style';

// A bare line for the foot of a stat card: no scales, grid, ticks or legend.
// `@points` is [{ month: 'YYYY-MM', value: Number }], `@color` a token name.
export default class StatSparklineComponent extends Component {
  @service region;

  get points() {
    return this.args.points ?? [];
  }

  get locale() {
    return navigator.language || 'en';
  }

  get money() {
    return moneyFormatter(this.locale, this.region.currencyCode);
  }

  get labels() {
    return this.points.map(
      (point) =>
        formatCalendarDate(`${point.month}-01`, this.locale, {
          month: 'short',
        }) ?? point.month,
    );
  }

  get values() {
    return this.points.map((point) => Number(point.value) || 0);
  }

  get caption() {
    return this.args.caption ?? 'Monthly totals';
  }

  get rows() {
    return this.points.map((point, index) => ({
      label: this.labels[index],
      value: this.money(this.values[index]),
    }));
  }

  get config() {
    const line = token(this.args.color ?? '--primary');

    return {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            data: this.values,
            borderColor: line,
            borderWidth: 2,
            backgroundColor: withAlpha(line, 0.14),
            fill: true,
            // Straight segments. Curve interpolation invents values between
            // months that never existed, and smooths a real change into a wave.
            tension: 0,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: line,
            pointBorderColor: line,
            pointHitRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Without it the stroke and the dots clip against the canvas edge.
        layout: { padding: { top: 8, bottom: 4, left: 6, right: 6 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (item) => this.money(item.parsed.y) },
          },
        },
        scales: {
          x: { display: false },
          // Scaled to the data, not to zero: six months of revenue vary by a
          // few percent, and a zero baseline flattens that into a straight
          // line. The value above the chart carries the magnitude; this
          // carries the shape. `grace` keeps the extremes off the edges.
          y: { display: false, grace: '20%' },
        },
      },
    };
  }
}
