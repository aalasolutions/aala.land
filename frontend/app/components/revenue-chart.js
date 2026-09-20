import Component from '@glimmer/component';
import { service } from '@ember/service';
import { formatCalendarDate } from '../utils/local-date';
import { moneyFormatter, token, withAlpha } from '../utils/chart-style';

export default class RevenueChartComponent extends Component {
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
    return this.points.map((point) => Number(point.total) || 0);
  }

  get rows() {
    return this.points.map((point, index) => ({
      label: this.labels[index],
      value: this.money(this.values[index]),
    }));
  }

  // Sparkline: the line only. No scales, grid, ticks, axis borders or legend.
  get config() {
    const line = token('--primary');

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
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: line,
            pointBorderColor: line,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Without it the 2px stroke clips against the canvas edge.
        layout: { padding: { top: 3, bottom: 3 } },
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
          y: { display: false, beginAtZero: true },
        },
      },
    };
  }
}
