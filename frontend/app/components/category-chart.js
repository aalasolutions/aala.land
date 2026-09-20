import Component from '@glimmer/component';
import { service } from '@ember/service';
import {
  compactFormatter,
  humanize,
  moneyFormatter,
  token,
} from '../utils/chart-style';

export default class CategoryChartComponent extends Component {
  @service region;

  get locale() {
    return navigator.language || 'en';
  }

  get money() {
    return moneyFormatter(this.locale, this.region.currencyCode);
  }

  get totals() {
    return this.args.totals ?? [];
  }

  // One row per category, biggest first, with income and expense side by side.
  get categories() {
    const byCategory = new Map();
    for (const row of this.totals) {
      const key = row.category ?? 'OTHER';
      const entry = byCategory.get(key) ?? { key, income: 0, expense: 0 };
      if (row.type === 'EXPENSE') entry.expense += Number(row.total) || 0;
      else entry.income += Number(row.total) || 0;
      byCategory.set(key, entry);
    }
    return [...byCategory.values()].sort(
      (a, b) => b.income + b.expense - (a.income + a.expense),
    );
  }

  get labels() {
    return this.categories.map((entry) => humanize(entry.key));
  }

  get hasData() {
    return this.categories.length > 0;
  }

  get rows() {
    return this.categories.flatMap((entry, index) => {
      const label = this.labels[index];
      const out = [];
      if (entry.income) {
        out.push({ label: `${label} income`, value: this.money(entry.income) });
      }
      if (entry.expense) {
        out.push({
          label: `${label} expense`,
          value: this.money(entry.expense),
        });
      }
      return out;
    });
  }

  get config() {
    const income = token('--primary');
    const expense = token('--danger');
    const muted = token('--text-muted');
    const border = token('--border-base');
    const compact = compactFormatter(this.locale);

    return {
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'Income',
            data: this.categories.map((entry) => entry.income),
            backgroundColor: income,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: 'Expense',
            data: this.categories.map((entry) => entry.expense),
            backgroundColor: expense,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: 'y',
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
                `${item.dataset.label}: ${this.money(item.parsed.x)}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: border, drawTicks: false },
            border: { display: false },
            ticks: { color: muted, font: { size: 11 }, callback: compact },
          },
          y: {
            grid: { display: false },
            border: { color: border },
            ticks: { color: muted, font: { size: 11 } },
          },
        },
      },
    };
  }
}
