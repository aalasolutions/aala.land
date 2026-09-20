import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_TYPE =
  '"primary" | "secondary" | "success" | "warning" | "danger" | "info"';

const VARIANT_NOTES = {
  default: 'Neutral fill for progress with no judgement, such as an upload.',
  primary: 'The brand fill for a task the user started.',
  secondary: 'A muted fill for background work.',
  success: 'Completion or a target that is being met.',
  warning: 'A quota that is filling up.',
  danger: 'A limit that is about to be exceeded.',
  info: 'An informational measure such as occupancy.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoProgressController extends Controller {
  @tracked progressValue = 62;

  barVariantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::Progress @value={{60}} @showText={{true}} />'
        : `<Nuvo::Progress @value={{60}} @variant="${variant}" @showText={{true}} />`,
  }));

  circleVariantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::ProgressCircle @value={{60}} @showText={{true}} />'
        : `<Nuvo::ProgressCircle @value={{60}} @variant="${variant}" @showText={{true}} />`,
  }));

  @action
  bumpProgress() {
    this.progressValue = this.progressValue >= 100 ? 0 : this.progressValue + 10;
  }

  code = {
    live: `<Nuvo::Progress @value={{this.progressValue}} @variant="primary" @showText={{true}} />
<Nuvo::Button @variant="secondary" @size="sm" @text="Bump progress" @onClick={{this.bumpProgress}} />`,
    sm: `<Nuvo::Progress @value={{50}} @size="sm" />`,
    md: `<Nuvo::Progress @value={{50}} />`,
    lg: `<Nuvo::Progress @value={{50}} @size="lg" />`,
    indeterminate: `<Nuvo::Progress @indeterminate={{true}} />`,
    striped: `<Nuvo::Progress @value={{60}} @striped={{true}} @variant="info" />`,
    label: `<Nuvo::Progress @value={{35}} @showText={{true}} @label="7 of 20 units" />`,
    clamp: `<Nuvo::Progress @value={{140}} @showText={{true}} />`,
    circleSm: `<Nuvo::ProgressCircle @value={{45}} @variant="success" @showText={{true}} @size="sm" />`,
    circleMd: `<Nuvo::ProgressCircle @value={{75}} @showText={{true}} />`,
    circleLg: `<Nuvo::ProgressCircle @value={{90}} @variant="danger" @showText={{true}} @size="lg" />`,
    circleStroke: `<Nuvo::ProgressCircle @value={{30}} @variant="warning" @strokeWidth={{10}} @showText={{true}} />`,
    circleNoText: `<Nuvo::ProgressCircle @value={{30}} @variant="primary" />`,
  };

  barArgRows = [
    { name: '@value', type: 'number', default: '0', description: 'Percentage, clamped to 0..100. Non-numeric input renders 0.' },
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Bar colour.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Track height step.' },
    { name: '@indeterminate', type: 'boolean', default: 'false', description: 'Sweeping animation for unknown progress.' },
    { name: '@striped', type: 'boolean', default: 'false', description: 'Diagonal stripes on the bar.' },
    { name: '@showText', type: 'boolean', default: 'false', description: 'Renders the label beside the track.' },
    { name: '@label', type: 'string', default: '', description: 'Label text; defaults to "{value}%".' },
  ];

  circleArgRows = [
    { name: '@value', type: 'number', default: '0', description: 'Percentage, clamped to 0..100.' },
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Arc colour.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Diameter step.' },
    { name: '@strokeWidth', type: 'number', default: '6', description: 'Ring thickness in viewBox units (0..100 box).' },
    { name: '@showText', type: 'boolean', default: 'false', description: 'Renders "{value}%" in the centre.' },
  ];
}
