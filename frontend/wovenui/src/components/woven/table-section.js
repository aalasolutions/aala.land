import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';

export default class WovenTableSectionComponent extends Component {
  @tracked optionsHost = null;

  // The body's table renders its Options trigger into this element.
  registerOptionsHost = modifier((element) => {
    this.optionsHost = element;
    return () => {
      if (this.optionsHost === element) this.optionsHost = null;
    };
  });
}
