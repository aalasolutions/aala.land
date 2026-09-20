import Component from '@glimmer/component';
import { service } from '@ember/service';
import { formatCalendarDate } from '../utils/local-date';
import {
  compactFormatter,
  moneyFormatter,
  token,
  withAlpha,
} from '../utils/chart-style';

export default class CashflowChartComponent extends Component {
  @service region;

  get locale() {
    return navigator.language || 'en';
  }

  get money() {
    return moneyFormatter(this.locale, this.region.currencyCode);
  }

  get points() {
    return this.args.points ?? [];
  }

  get labels() {
    return this.points.map(
      (point) =>
        formatCalendarDate(`${point.month}-01`, this.locale, {
          month: 'short',
        }) ?? point.month,
    );
  }

  get rows() {
    return this.points.flatMap((point, index) => [
      {
        label: `${this.labels[index]} income`,
        value: this.money(Number(point.income) || 0),
      },
      {
        label: `${this.labels[index]} expense`,
        value: this.money(Number(point.expense) || 0),
      },
    ]);
  }

  get config() {
    const income = token('--primary');
    const expense = token('--danger');
    const muted = token('--text-muted');
    const border = token('--border-base');
    const compact = compactFormatter(this.locale);

    const series = (label, color, key) => ({
      label,
      data: this.points.map((point) => Number(point[key]) || 0),
      borderColor: color,
      borderWidth: 2,
      backgroundColor: withAlpha(color, 0.12),
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointBackgroundColor: color,
    });

    return {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          series('Income', income, 'income'),
          series('Expense', expense, 'expense'),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: muted, boxWidth: 10, boxHeight: 10 },
          },
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.dataset.label}: ${this.money(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: border },
            ticks: { color: muted, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: border, drawTicks: false },
            border: { display: false },
            ticks: {
              color: muted,
              font: { size: 11 },
              maxTicksLimit: 5,
              padding: 8,
              callback: compact,
            },
          },
        },
      },
    };
  }
}
