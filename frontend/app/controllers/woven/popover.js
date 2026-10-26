import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const PLACEMENT_NOTES = {
  top: 'Above the trigger, for controls near the bottom of the viewport.',
  bottom: 'Below the trigger; the default and the natural reading order.',
  start: 'Beside the trigger on the inline-start side, for controls at the end of a row.',
  end: 'Beside the trigger on the inline-end side, for controls at the start of a row.',
};

export default class WovenPopoverController extends Controller {
  @tracked popoverOpen = false;

  placementExamples = Object.keys(PLACEMENT_NOTES).map((placement) => ({
    placement,
    title: `placement ${placement}`,
    note: PLACEMENT_NOTES[placement],
    code: `<Woven::Popover @title="Placement" @placement="${placement}">
  <:trigger as |toggle|>
    <Woven::Button @text="${placement}" @variant="secondary" @onClick={{toggle}} />
  </:trigger>
  <:body>
    <Woven::Text @size="sm" @text="Positioned by the anchor modifier; flips when there is no room." />
  </:body>
</Woven::Popover>`,
  }));

  // Controlled mode: the component reports open requests, the caller owns the flag.
  @action
  setPopoverOpen(open) {
    this.popoverOpen = open;
  }

  @action
  closePopover() {
    this.popoverOpen = false;
  }

  code = {
    uncontrolled: `<Woven::Popover @title="Details">
  <:trigger as |toggle isOpen|>
    <Woven::Button @text="Open" @variant="secondary" @onClick={{toggle}} aria-expanded={{if isOpen "true" "false"}} />
  </:trigger>
  <:body>
    <Woven::Text @size="sm" @text="The popover keeps its own open state." />
  </:body>
</Woven::Popover>`,
    controlled: `<Woven::Popover
  @title="Quick actions"
  @open={{this.popoverOpen}}
  @onToggle={{this.setPopoverOpen}}
  @onClose={{this.closePopover}}
>
  <:trigger as |toggle|>
    <Woven::Button @text="Unit actions" @variant="secondary" @onClick={{toggle}} />
  </:trigger>
  <:body>
    <Woven::Text @text="Edit, duplicate, or archive this unit." />
  </:body>
  <:footer>
    <Woven::Button @text="Close" @size="sm" @variant="ghost" @onClick={{this.closePopover}} />
  </:footer>
</Woven::Popover>`,
    alignEnd: `<Woven::Popover @placement="bottom" @align="end">
  <:trigger as |toggle|>
    <Woven::Button @icon="dots-three" @shape="square" @variant="secondary" @onClick={{toggle}} aria-label="More" />
  </:trigger>
  <:body>
    <Woven::Text @size="sm" @text="Hangs from the trigger's end edge." />
  </:body>
</Woven::Popover>`,
    noTitle: `<Woven::Popover>
  <:trigger as |toggle|>
    <Woven::Button @text="No title" @variant="secondary" @onClick={{toggle}} />
  </:trigger>
  <:body>
    <Woven::Text @size="sm" @text="No header or close button. Escape and outside click still close it." />
  </:body>
</Woven::Popover>`,
    footer: `<Woven::Popover @title="Confirm">
  <:trigger as |toggle|>
    <Woven::Button @text="With footer" @variant="secondary" @onClick={{toggle}} />
  </:trigger>
  <:body>
    <Woven::Text @size="sm" @text="Archive this unit?" />
  </:body>
  <:footer>
    <Woven::Button @text="Archive" @size="sm" @variant="danger" />
  </:footer>
</Woven::Popover>`,
  };

  argRows = [
    { name: '@title', type: 'string', default: '', description: 'Header title. Also renders the close button and labels the dialog.' },
    { name: '@placement', type: '"top" | "bottom" | "start" | "end"', default: '"bottom"', description: 'Preferred side, logical. Flips to the opposite side when it does not fit.' },
    { name: '@align', type: '"end"', default: '', description: 'Aligns the panel to the trigger\'s end edge instead of centring it (top and bottom only).' },
    { name: '@open', type: 'boolean', default: '', description: 'Controlled open state. Omit for uncontrolled mode.' },
  ];

  callbackRows = [
    { name: '@onToggle', signature: '(true)', description: 'Controlled mode only: the trigger asked to open. Set @open in response.' },
    { name: '@onClose', signature: '()', description: 'Closed by the close button, Escape, outside click, outside scroll or resize.' },
  ];

  blockRows = [
    { name: 'trigger', description: 'The control that opens the popover. Yields (toggle, isOpen).' },
    { name: 'body', description: 'Panel content.' },
    { name: 'footer', description: 'Optional footer row.' },
  ];
}
