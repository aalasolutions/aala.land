import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AppButtonComponent extends Component {
  get variantClasses() {
    const variant = this.args.variant || 'secondary';
    const variantMap = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      success: 'btn-success',
      danger: 'btn-danger',
      warning: 'btn-warning'
    };

    return variantMap[variant] || 'btn-secondary';
  }

  get buttonClass() {
    const baseClass = 'btn';
    const variantClass = this.variantClasses;
    const customClass = this.args.class || '';

    return `${baseClass} ${variantClass} ${customClass}`.trim();
  }

  get buttonText() {
    if (this.args.loading) {
      return this.args.loadingText || 'Loading...';
    }
    return this.args.text;
  }

  get isDisabled() {
    return this.args.loading || this.args.disabled;
  }

  @action
  onClickHandler() {
    this.args.onClick?.();
  }
}