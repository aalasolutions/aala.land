import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { tierSentence } from 'land/utils/feature-gate';

export default class DataTransferUpgradePromptComponent extends Component {
  @service router;

  get message() {
    return this.args.message ?? tierSentence(this.args.kind ?? 'import');
  }

  @action seePlans() {
    this.args.onClose?.();
    this.router.transitionTo('company', { queryParams: { tab: 'billing' } });
  }
}
