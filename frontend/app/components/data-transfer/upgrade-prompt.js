import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';

export const UPGRADE_MESSAGE =
  'This feature is on the Pro and Enterprise plans.';

export default class DataTransferUpgradePromptComponent extends Component {
  @service router;

  get message() {
    return this.args.message ?? UPGRADE_MESSAGE;
  }

  @action seePlans() {
    this.args.onClose?.();
    this.router.transitionTo('company', { queryParams: { tab: 'billing' } });
  }
}
