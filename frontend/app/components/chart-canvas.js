import Component from '@glimmer/component';
import { registerDestructor } from '@ember/destroyable';
import { service } from '@ember/service';
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
const EDGE = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Owns the Chart.js lifecycle, the HTML tooltip and the screen-reader table.
export default class ChartCanvasComponent extends Component {
  @service layer;

  chart = null;
  tip = null;
  signature = null;
  optionsSignature = null;
  dismissArmed = false;

  constructor() {
    super(...arguments);
    registerDestructor(this, () => {
      this.disarmDismiss();
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

  registerTip = modifier((element) => {
    this.tip = element;
    // Identity check: the tip is re-inserted when the layer host registers.
    return () => {
      if (this.tip === element) this.tip = null;
    };
  });

  // An element, not a canvas-painted tooltip: those are trapped inside the canvas box.
  positionTip = ({ chart, tooltip }) => {
    const tip = this.tip;
    if (!tip) return;

    if (!tooltip.opacity) {
      this.hideTip();
      return;
    }

    const lines = [
      tooltip.title?.[0],
      ...(tooltip.body ?? []).flatMap((entry) => entry.lines ?? []),
    ].filter(Boolean);
    tip.textContent = lines.join('\n');
    tip.hidden = false;
    this.armDismiss();

    // Measured with the tip on screen: a hidden element reports no size.
    const { offsetWidth: width, offsetHeight: height } = tip;
    const canvasBox = chart.canvas.getBoundingClientRect();
    const caretX = canvasBox.left + tooltip.caretX;
    const caretY = canvasBox.top + tooltip.caretY;
    const above = caretY - TIP_GAP - height;

    tip.style.left = `${clamp(
      caretX - width / 2,
      EDGE,
      Math.max(EDGE, window.innerWidth - EDGE - width),
    )}px`;
    tip.style.top = `${clamp(
      above >= EDGE ? above : caretY + TIP_GAP,
      EDGE,
      Math.max(EDGE, window.innerHeight - EDGE - height),
    )}px`;
  };

  // Fixed coordinates go stale on scroll; the next pointer move paints it again.
  hideTip = () => {
    if (this.tip) this.tip.hidden = true;
    this.disarmDismiss();
  };

  armDismiss() {
    if (this.dismissArmed) return;
    this.dismissArmed = true;
    window.addEventListener('scroll', this.hideTip, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', this.hideTip, { passive: true });
  }

  disarmDismiss() {
    if (!this.dismissArmed) return;
    this.dismissArmed = false;
    window.removeEventListener('scroll', this.hideTip, true);
    window.removeEventListener('resize', this.hideTip);
  }

  // Never mutates the caller's config.
  withTooltip(config = {}) {
    const options = config?.options ?? {};
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

  // @config is rebuilt on every model refresh, so identity cannot tell whether data moved.
  draw = modifier((canvas) => {
    const config = this.withTooltip(this.args.config);
    const signature = JSON.stringify(config.data);
    // JSON drops functions: callback-only options changes ride with the data.
    const optionsSignature = JSON.stringify(config.options);

    if (!this.chart) {
      this.chart = new Chart(canvas, config);
    } else if (
      signature !== this.signature ||
      optionsSignature !== this.optionsSignature
    ) {
      this.chart.data = config.data;
      this.chart.options = config.options;
      this.chart.update();
    }

    this.signature = signature;
    this.optionsSignature = optionsSignature;
  });
}
