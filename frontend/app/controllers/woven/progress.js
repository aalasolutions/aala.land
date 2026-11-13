import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const VARIANT_TYPE = '"success" | "warning" | "danger" | "info"';

const VARIANT_NOTES = {
  default: 'No @variant: the kit default fill, for a task the user started such as an upload. brand and secondary render the same.',
  success: 'Completion or a target that is being met.',
  warning: 'A quota that is filling up.',
  danger: 'A limit that is about to be exceeded.',
  info: 'An informational measure such as occupancy.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenProgressController extends Controller {
  @tracked progressValue = 62;

  barVariantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Progress @value={{60}} @showText={{true}} />'
        : `<Woven::Progress @value={{60}} @variant="${variant}" @showText={{true}} />`,
  }));

  circleVariantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::ProgressCircle @value={{60}} @showText={{true}} />'
        : `<Woven::ProgressCircle @value={{60}} @variant="${variant}" @showText={{true}} />`,
  }));

  @action
  bumpProgress() {
    this.progressValue = this.progressValue >= 100 ? 0 : this.progressValue + 10;
  }

  code = {
    live: `<Woven::Progress @value={{this.progressValue}} @showText={{true}} />
<Woven::Button @size="sm" @text="Bump progress" @onClick={{this.bumpProgress}} />`,
    sm: `<Woven::Progress @value={{50}} @size="sm" />`,
    md: `<Woven::Progress @value={{50}} />`,
    lg: `<Woven::Progress @value={{50}} @size="lg" />`,
    indeterminate: `<Woven::Progress @indeterminate={{true}} aria-label="Loading" />`,
    label: `<Woven::Progress @value={{35}} @showText={{true}} @label="7 of 20 units" />`,
    clamp: `<Woven::Progress @value={{140}} @showText={{true}} />`,
    circleSm: `<Woven::ProgressCircle @value={{45}} @variant="success" @showText={{true}} @size="sm" />`,
    circleMd: `<Woven::ProgressCircle @value={{75}} @showText={{true}} />`,
    circleLg: `<Woven::ProgressCircle @value={{90}} @variant="danger" @showText={{true}} @size="lg" />`,
    circleNoText: `<Woven::ProgressCircle @value={{30}} aria-label="Storage used" />`,
  };

  barArgRows = [
    { name: '@value', type: 'number', default: '0', description: 'Native value attribute, clamped to 0..100. Non-numeric input renders 0.' },
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Kit role modifier for the fill. brand, secondary and unknown values render the default fill.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm (thinner) or lg (thicker); xs renders sm and xl renders lg.' },
    { name: '@indeterminate', type: 'boolean', default: 'false', description: 'Omits the value attribute, so the kit shows its sliding segment.' },
    { name: '@showText', type: 'boolean', default: 'false', description: 'Renders a kit wu-progress-label above the bar, linked with for.' },
    { name: '@label', type: 'string', default: '', description: 'Label text when @showText is set; defaults to "{value}%".' },
  ];

  circleArgRows = [
    { name: '@value', type: 'number', default: '0', description: 'Percentage, clamped to 0..100.' },
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Kit role modifier for the ring. brand, secondary and unknown values render the default ring.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm (2.5rem) or lg (6rem); xs renders sm and xl renders lg. Default 4rem.' },
    { name: '@showText', type: 'boolean', default: 'false', description: 'Renders "{value}%" in the kit wu-progress-circle-label at the center.' },
  ];
}
