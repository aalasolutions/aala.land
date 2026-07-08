import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class FormTextareaComponent extends Component {
  @action
  handleInput(event) {
    this.args.onChange?.(event);
  }
}
