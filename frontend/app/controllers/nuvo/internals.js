import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const TOAST_NOTES = {
  success: 'A completed action: saved, sent, paid. Disappears after four seconds.',
  info: 'Neutral feedback such as a sync starting. Four seconds.',
  warning: 'Something to check that did not block the action. Four seconds.',
  error: 'A failure. Sticky until dismissed, so it is never missed.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoInternalsController extends Controller {
  @service notifications;

  @tracked toastCount = 0;
  @tracked stickyId = null;

  toastExamples = Object.keys(TOAST_NOTES).map((type) => ({
    type,
    title: capitalize(type),
    note: TOAST_NOTES[type],
    code: `this.notifications.${type}('${capitalize(type)} toast');`,
  }));

  @action
  toast(type) {
    this.toastCount += 1;
    this.notifications[type](`${type} toast #${this.toastCount}`);
  }

  @action
  addSticky() {
    if (this.stickyId !== null) {
      return;
    }
    this.stickyId = this.notifications.add('Syncing contacts...', 'info', 0);
  }

  @action
  removeSticky() {
    if (this.stickyId === null) {
      return;
    }
    this.notifications.remove(this.stickyId);
    this.stickyId = null;
  }

  @action
  clearToasts() {
    this.notifications.clear();
    this.stickyId = null;
  }

  code = {
    mount: `{{! app/templates/application.hbs, after the routed content }}
<Nuvo::ToastRegion />
<Nuvo::LayerHost />
<Nuvo::TooltipHost />
<Nuvo::DialogHost />`,
    toastPosition: `<Nuvo::ToastRegion @position="bottom-end" />`,
    anchor: `{{#if this.isOpen}}
  {{#in-element this.layer.element insertBefore=null}}
    <div
      class="nu-menu is-open"
      {{did-insert this.registerMenu}}
      {{will-destroy this.forgetMenu}}
      {{on "keydown" this.handleKeydown}}
      {{anchor this.rootElement placement="bottom" align="start" gap=4 matchWidth=true onDismiss=this.close}}
    >
      ...
    </div>
  {{/in-element}}
{{/if}}`,
    dialog: `<div
  class="nu-modal is-open"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  {{dialog onEscape=this.onClose closeOnEsc=@closeOnEsc}}
>`,
    transition: `<div
  class={{this.backdropClasses}}
  {{dialog-transition @open onOpen=this.onOpen onVisible=this.onVisible onHide=this.onHide onHidden=this.onHidden}}
>`,
    sticky: `const id = this.notifications.add('Syncing contacts...', 'info', 0);
// later
this.notifications.remove(id);`,
    clear: `this.notifications.clear();`,
    iconFlip: `<Ui::Ph @icon="arrow-right" />`,
    iconNoFlip: `<Ui::Ph @icon="arrow-right" @flip={{false}} />`,
    iconSize: `<Ui::Ph @icon="house" @size="24px" @color="var(--primary)" />`,
  };

  hostRows = [
    { name: 'Nuvo::ToastRegion', signature: '@position', description: 'Renders notifications.toasts as role="log" aria-live="polite". Position: top-start, top-end, bottom-start, bottom-end. Sits at the toast z-index, above everything.' },
    { name: 'Nuvo::LayerHost', signature: '', description: 'A zero-size fixed div (.nu-layer) at the modal z-index that registers itself with the layer service. Dropdown menus and popovers render into it.' },
    { name: 'Nuvo::TooltipHost', signature: '', description: 'Installs delegated document listeners and renders one .nu-tooltip only while a tooltip is visible.' },
    { name: 'Nuvo::DialogHost', signature: '', description: 'Renders Nuvo::ConfirmModal from the dialogs service\'s current dialog.' },
  ];

  layerRows = [
    { name: 'layer.element', signature: 'HTMLElement', description: 'The registered .nu-layer, or a body-level fallback div so rendering tests without the host still work.' },
    { name: 'layer.register', signature: '(element)', description: 'Called by LayerHost on insert.' },
    { name: 'layer.unregister', signature: '(element)', description: 'Called by LayerHost on destroy.' },
  ];

  anchorRows = [
    { name: 'trigger', type: 'HTMLElement (positional)', default: '', description: 'Element to anchor to; the dropdown passes its root, the popover its root.' },
    { name: 'placement', type: '"top" | "bottom" | "start" | "end"', default: '"bottom"', description: 'Preferred side, logical, resolved against the trigger\'s computed direction. Flips only when the other side fits.' },
    { name: 'align', type: '"start" | "center" | "end"', default: '"start"', description: 'Alignment along the other axis for top and bottom. Side placements are vertically centred.' },
    { name: 'gap', type: 'number', default: '4', description: 'Pixels between trigger and element (popover passes 8).' },
    { name: 'matchWidth', type: 'boolean', default: 'false', description: 'Writes min-inline-size equal to the trigger width for select-like menus.' },
    { name: 'onDismiss', type: 'function', default: '', description: 'Called on any scroll outside the element (capture) or on resize; armed one frame after open.' },
  ];

  anchorWritesRows = [
    { name: 'dir', description: 'Copied from the trigger.' },
    { name: 'position, inset, margin, transform', description: 'fixed, auto, 0, none; then left and top in px after clamping to the viewport with an 8px edge.' },
    { name: 'data-placement', description: 'Physical side after flip: top, bottom, left or right. popover.scss positions the arrow from it.' },
    { name: '--nu-anchor--ArrowX / --nu-anchor--ArrowY', description: 'Trigger centre relative to the element, in px, for arrows.' },
  ];

  tooltipRows = [
    { name: 'tooltip.show', signature: '(trigger)', description: 'Reads data-tooltip, data-tooltip-position and data-tooltip-light; shows after 120ms; sets aria-describedby; observes the attribute for live text.' },
    { name: 'tooltip.hide', signature: '()', description: 'Hides and releases the trigger.' },
    { name: 'tooltip.isCurrentTrigger', signature: '(element)', description: 'True while the element owns the visible tooltip.' },
    { name: 'tooltip.content / placement / light / anchor / isVisible', signature: 'tracked', description: 'State the host renders from; anchor is a DOMRect snapshot of the trigger.' },
    { name: 'TOOLTIP_ID', signature: '"nu-tooltip-active"', description: 'Id of the rendered element and value of the trigger\'s aria-describedby.' },
  ];

  tooltipFitRows = [
    { name: 'anchor, content, placement', type: 'positional', default: '', description: 'Re-runs after every change. Placement is the resolved physical side.' },
    { name: 'writes', type: 'CSS custom properties', default: '', description: 'Caps max-inline-size to the viewport minus 16px; --nu-tooltip--ShiftX/Y slide the box inside the viewport; --nu-tooltip--ArrowShiftX/Y counter-shift the arrow, clamped 12px from the corners.' },
  ];

  dialogFocusRows = [
    { name: 'openDialog', signature: '(element) => release', description: 'Locks body scroll, pushes onto the dialog stack, traps Tab on the document in capture. The returned function releases and restores focus to the opener.' },
    { name: 'focusFirstControl', signature: '(element)', description: 'Focuses the first visible focusable control, skipping nu-modal__close, nu-drawer__close and nu-field__info.' },
    { name: 'isTopmostDialog', signature: '(element)', description: 'Whether this element owns Escape and the Tab trap.' },
    { name: 'resetDialogStateForTesting', signature: '()', description: 'Clears the module stack between tests; compiled out of production by @embroider/macros.' },
  ];

  dialogModifierRows = [
    { name: 'closeOnEsc', type: 'boolean', default: 'true', description: 'Read at event time; set false to ignore Escape.' },
    { name: 'onEscape', type: 'function', default: '', description: 'Called on Escape when the dialog is topmost.' },
  ];

  transitionRows = [
    { name: 'open', type: 'boolean (positional)', default: '', description: 'Drives enter and leave.' },
    { name: 'onOpen', type: 'function', default: '', description: 'Mount the panel.' },
    { name: 'onVisible', type: 'function', default: '', description: 'Next task after mount, after a forced style flush: add the open classes.' },
    { name: 'onHide', type: 'function', default: '', description: 'Remove the open classes.' },
    { name: 'onHidden', type: 'function', default: '', description: 'After the computed transition-duration: unmount.' },
  ];

  notificationRows = [
    { name: 'notifications.add', signature: '(message, type = "info", duration = 4000) => id', description: 'Queues a toast; duration 0 keeps it until removed.' },
    { name: 'notifications.success / info / warning', signature: '(message, duration?)', description: 'Typed shortcuts.' },
    { name: 'notifications.error', signature: '(message, duration = 0)', description: 'Sticky by default. Rendered with the danger variant.' },
    { name: 'notifications.remove', signature: '(id)', description: 'Dismisses one toast.' },
    { name: 'notifications.clear', signature: '()', description: 'Dismisses all.' },
    { name: 'notifications.toasts', signature: 'tracked array', description: '{ id, message, type } entries the region renders, keyed by id.' },
  ];

  iconRows = [
    { name: '@icon', type: 'string', default: '', description: 'Phosphor icon name, rendered as <i class="ph ph-{name}" role="img">.' },
    { name: '@size', type: 'string', default: '"1em"', description: 'Font size of the glyph.' },
    { name: '@color', type: 'string', default: '"currentColor"', description: 'Glyph colour.' },
    { name: '@flip', type: 'boolean', default: '', description: 'Overrides the automatic RTL mirror. Names matching left or right mirror by default.' },
  ];

  dependencyRows = [
    { name: 'ember-modifier', signature: 'anchor, tooltip-fit, dialog, dialog-transition, field.linkControl', description: 'Class and function modifiers.' },
    { name: 'ember-lifeline', signature: 'runTask, cancelTask', description: 'Timers in dropdown, tooltip, notifications, dialog and dialog-transition.' },
    { name: '@ember/render-modifiers', signature: 'did-insert, did-update, will-destroy', description: 'Checkbox indeterminate sync, dropdown, popover, layer-host, segmented, tabs.' },
    { name: 'ember-truth-helpers', signature: 'eq', description: 'The only truth helper kit templates use.' },
    { name: '@embroider/macros', signature: 'macroCondition, isTesting', description: 'Strips the dialog test reset from production.' },
  ];
}
