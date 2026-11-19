import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { formatBytes } from 'land/helpers/format-bytes';

export default class DataTransferFileDropComponent extends Component {
  @tracked file = null;
  @tracked error = '';
  @tracked isOver = false;

  inputId = `${guidFor(this)}-file`;

  get extensions() {
    return (this.args.accept ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  get acceptLabel() {
    return this.extensions.join(', ');
  }

  // Validates by extension and size; the server checks the bytes again.
  take(file) {
    this.isOver = false;
    if (!file) return;
    const name = file.name.toLowerCase();
    if (
      this.extensions.length &&
      !this.extensions.some((extension) => name.endsWith(extension))
    ) {
      this.reject(`Choose a ${this.acceptLabel} file.`);
      return;
    }
    if (this.args.maxSize && file.size > this.args.maxSize) {
      this.reject(
        `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(this.args.maxSize)}.`,
      );
      return;
    }
    this.error = '';
    this.file = file;
    this.args.onFile?.(file);
  }

  reject(message) {
    this.error = message;
    this.file = null;
    this.args.onFile?.(null);
  }

  @action change(event) {
    this.take(event.target.files?.[0]);
    event.target.value = '';
  }

  @action over(event) {
    event.preventDefault();
    this.isOver = true;
  }

  @action leave() {
    this.isOver = false;
  }

  @action drop(event) {
    event.preventDefault();
    this.take(event.dataTransfer?.files?.[0]);
  }
}
