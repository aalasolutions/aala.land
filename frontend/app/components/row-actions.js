import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';

export default class RowActionsComponent extends Component {
  get visible() {
    return (this.args.actions ?? []).filter((a) => a && !a.hidden);
  }

  get menuActions() {
    const actions = this.visible;
    return [
      ...actions.filter((a) => a.variant !== 'danger'),
      ...actions.filter((a) => a.variant === 'danger'),
    ];
  }

  get triggerLabel() {
    return this.args.label ? `Actions for ${this.args.label}` : 'Actions';
  }

  isDanger = (action) => action.variant === 'danger';

  isUnavailable = (action) => Boolean(action.disabled || action.loading);

  linkModels = (action) => action.models ?? [];

  // Closing first hands focus back to the trigger, so a dialog the action opens restores it there.
  select = (close, action, event) => {
    close();
    action.onSelect?.(event);
  };

  testAttr = modifier((element, [action]) => {
    const name = `data-test-${action.key}`;
    element.setAttribute(name, action.testValue ?? '');
    return () => element.removeAttribute(name);
  });
}
