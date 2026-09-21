import { token, withAlpha } from '../utils/chart-style';
import ChartBase from './chart-base';

// Bare line for a stat card foot (no scales/grid/legend); `@variant` is a kit variant name.
export default class StatSparklineComponent extends ChartBase {
  get points() {
    return this.args.points ?? [];
  }

  get labels() {
    return this.pointLabels(this.points);
  }

  get values() {
    return this.points.map((point) => Number(point.value) || 0);
  }

  get caption() {
    return this.args.caption ?? 'Totals';
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

  get config() {
    const line = token(`--${this.args.variant ?? 'primary'}`);

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
            // Straight segments: curve interpolation invents values between the buckets.
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
          // Scaled to the data, not zero: a zero baseline flattens a few percent into a flat line.
          y: { display: false, grace: '20%' },
        },
      },
    };
  }
}
