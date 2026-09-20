import Component from '@glimmer/component';
import { registerDestructor } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

const TIP_GAP = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Owns the Chart.js lifecycle, the HTML tooltip and the screen-reader table so
// the charts above it only have to describe their data.
export default class ChartCanvasComponent extends Component {
  chart = null;
  signature = null;

  constructor() {
    super(...arguments);
    registerDestructor(this, () => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  get rows() {
    return this.args.rows ?? [];
  }

  get caption() {
    return this.args.caption ?? 'Chart data';
  }

  get valueLabel() {
    return this.args.valueLabel ?? 'Value';
  }

  // Canvas-painted tooltips are trapped inside the canvas box, which is far too
  // small on a sparkline. This one is an element beside it.
  positionTip = ({ chart, tooltip }) => {
    const host = chart.canvas.closest('.chart-canvas');
    const tip = host?.querySelector('.chart-canvas__tip');
    if (!tip) return;

    if (!tooltip.opacity) {
      tip.hidden = true;
      return;
    }

    const lines = [
      tooltip.title?.[0],
      ...(tooltip.body ?? []).flatMap((entry) => entry.lines ?? []),
    ].filter(Boolean);
    tip.textContent = lines.join('\n');
    tip.hidden = false;

    const canvasBox = chart.canvas.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const offsetX = canvasBox.left - hostBox.left;
    const half = tip.offsetWidth / 2;

    tip.style.left = `${clamp(
      offsetX + tooltip.caretX,
      offsetX + half,
      offsetX + canvasBox.width - half,
    )}px`;
    tip.style.top = `${canvasBox.top - hostBox.top + tooltip.caretY - TIP_GAP}px`;
  };

  // Never mutates the caller's config.
  withTooltip(config) {
    const options = config.options ?? {};
    const plugins = options.plugins ?? {};
    return {
      ...config,
      options: {
        ...options,
        plugins: {
          ...plugins,
          tooltip: {
            ...(plugins.tooltip ?? {}),
            enabled: false,
            external: this.positionTip,
          },
        },
      },
    };
  }

  // @config is rebuilt on every model refresh, so identity says nothing about
  // whether the data moved. Switching a filter that the chart does not depend
  // on must not tear the chart down and animate it back in.
  draw = modifier((canvas) => {
    const config = this.withTooltip(this.args.config);
    const signature = JSON.stringify(config.data);

    if (!this.chart) {
      this.chart = new Chart(canvas, config);
    } else if (signature !== this.signature) {
      this.chart.data = config.data;
      this.chart.options = config.options;
      this.chart.update();
    }

    this.signature = signature;
  });
}
