import { token, withAlpha } from '../utils/chart-style';
import ChartBase from './chart-base';

export default class RevenueChartComponent extends ChartBase {
  get points() {
    return this.args.points ?? [];
  }

  get labels() {
    return this.monthLabels(this.points);
  }

  get values() {
    return this.points.map((point) => Number(point.total) || 0);
  }

  get rows() {
    const money = this.money;
    // Hoisted: each read of a getter rebuilds the whole array, so reading it per row is quadratic.
    const labels = this.labels;
    const values = this.values;
    return this.points.map((point, index) => ({
      label: labels[index],
      value: money(values[index]),
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
