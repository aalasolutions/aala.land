import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';

export default class GlassGlowComponent extends Component {
  @tracked x = 0;
  @tracked y = 0;
  @tracked opacity = 0;

  get spotStyle() {
    return htmlSafe(`left:${this.x}px;top:${this.y}px;opacity:${this.opacity};`);
  }

  @action
  handleMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    this.x = event.clientX - rect.left;
    this.y = event.clientY - rect.top;
    this.opacity = 1;
  }

  @action
  handleMouseLeave() {
    this.opacity = 0;
  }
}
