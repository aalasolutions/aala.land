import { token, withAlpha } from '../utils/chart-style';
import ChartBase from './chart-base';

export default class CashflowChartComponent extends ChartBase {
  get points() {
    return this.args.points ?? [];
  }

  get labels() {
    return this.pointLabels(this.points);
  }

  get rows() {
    const money = this.money;
    // Hoisted: each read of a getter rebuilds the whole array, so reading it per row is quadratic.
    const labels = this.labels;
    return this.points.flatMap((point, index) => [
      {
        label: `${labels[index]} income`,
        value: money(Number(point.income) || 0),
      },
      {
        label: `${labels[index]} expense`,
        value: money(Number(point.expense) || 0),
      },
    ]);
  }

  get config() {
    const income = token('--primary');
    const expense = token('--danger');
    const muted = token('--text-muted');
    const border = token('--border-base');
    const compact = this.compact;

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
