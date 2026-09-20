import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const POSITION_NOTES = {
  top: 'The default. Above the trigger, out of the way of what the pointer is about to click.',
  bottom: 'Below the trigger, for controls in a top bar where there is no room above.',
  start: 'On the inline-start side, for controls at the end of a row. Flips when there is under 260px of room.',
  end: 'On the inline-end side, for a collapsed sidebar rail. Flips likewise.',
};

export default class NuvoTooltipController extends Controller {
  @tracked clicks = 0;

  positionExamples = Object.keys(POSITION_NOTES).map((position) => ({
    position,
    title: `position ${position}`,
    note: POSITION_NOTES[position],
    code: `<Nuvo::Button @text="${position}" @variant="secondary" data-tooltip="${position} placement" data-tooltip-position="${position}" />`,
  }));

  @action
  bump() {
    this.clicks += 1;
  }

  code = {
    basic: `<Nuvo::Button @text="Hover me" @variant="secondary" data-tooltip="Default placement is top" />`,
    light: `<Nuvo::Button @text="Light" @variant="secondary" data-tooltip="Light surface tooltip" data-tooltip-light />`,
    disabled: `<span data-tooltip="Disabled button, wrapped so hover still registers" data-tooltip-position="bottom">
  <Nuvo::Button @text="Disabled" @variant="secondary" @disabled={{true}} />
</span>`,
    iconOnly: `<Nuvo::Button @icon="plugs" @shape="square" @variant="secondary" aria-label="Re-pair" data-tooltip="Re-pair device" />`,
    live: `<Nuvo::Button
  @text="Click while hovering"
  @variant="secondary"
  @onClick={{this.bump}}
  data-tooltip="Clicked {{this.clicks}} times"
/>`,
    text: `<span class="nu-text m-sm" tabindex="0" data-tooltip="Tenancy Registration: the government lease registry reference">TR ref</span>`,
    field: `<Nuvo::Field @label="Deposit" @tooltip="Held until the lease ends.">
  <Nuvo::Input @placeholder="5%" />
</Nuvo::Field>`,
  };

  attributeRows = [
    { name: 'data-tooltip', type: 'text', default: '', description: 'The whole API: any element with this attribute shows the text on hover and focus. Text only, no markup.' },
    { name: 'data-tooltip-position', type: '"top" | "bottom" | "start" | "end"', default: '"top"', description: 'Preferred placement, logical. Side placements flip when there is under 260px of room; top and bottom flip within 64px of the viewport edge.' },
    { name: 'data-tooltip-light', type: 'present', default: '', description: 'Light surface instead of the dark default.' },
  ];

  serviceRows = [
    { name: 'tooltip.show', signature: '(trigger)', description: 'Reads the data attributes from the element and shows after a 120ms delay.' },
    { name: 'tooltip.hide', signature: '()', description: 'Hides and releases the trigger.' },
    { name: 'tooltip.isCurrentTrigger', signature: '(element)', description: 'True while the element owns the visible tooltip.' },
    { name: 'tooltip.isVisible', signature: 'boolean', description: 'Tracked; true while content is set.' },
  ];
}
