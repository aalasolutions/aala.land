import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask } from 'ember-lifeline';

const COPIED_RESET = 1500;

const VARIANT_NOTES = {
  primary: 'A highlighted token such as the current value.',
  secondary: 'A second neutral tone.',
  success: 'A value that passed, such as a matching checksum.',
  warning: 'A deprecated flag.',
  danger: 'An invalid token or a failing command.',
  info: 'An identifier or a reference.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoCodeController extends Controller {
  @tracked copied = false;

  apiKey = 'nuvo_live_7f3a9c2e';

  numberedLines = [
    'import Component from "@glimmer/component";',
    '',
    'export default class Example extends Component {}',
  ];

  scrollLines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code: `<code class="nu-code m-${variant}">nu-code m-${variant}</code>`,
  }));

  get copyClasses() {
    return this.copied ? 'nu-clipboard-copy is-copied' : 'nu-clipboard-copy';
  }

  @action
  async copyKey() {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(this.apiKey);
    this.copied = true;
    runTask(this, () => (this.copied = false), COPIED_RESET);
  }

  code = {
    inline: `Run <code class="nu-code">pnpm install</code> first.`,
    block: `<div class="nu-code-block">
  <pre class="nu-code-block__content">this.route('nuvo', function () {
  this.route('button');
});</pre>
</div>`,
    header: `<div class="nu-code-block">
  <div class="nu-code-block__header">
    <span>app/router.js</span>
    <div class="nu-code-block__actions">
      <Nuvo::Button @variant="ghost" @size="xs" @text="Copy" />
    </div>
  </div>
  <pre class="nu-code-block__content">...</pre>
</div>`,
    scrollable: `<div class="nu-code-block m-scrollable">
  <pre class="nu-code-block__content">...30 lines...</pre>
</div>`,
    numbered: `<div class="nu-code-block m-numbered">
  <pre class="nu-code-block__content">{{#each this.lines as |line|}}<span class="nu-code-block__line">{{line}}</span>{{/each}}</pre>
</div>`,
    copy: `<div class="nu-clipboard-copy {{if this.copied 'is-copied'}}">
  <input class="nu-clipboard-copy__input" value={{this.apiKey}} readonly aria-label="API key" />
  {{#if this.copied}}<span class="nu-clipboard-copy__feedback">Copied</span>{{/if}}
  <button type="button" class="nu-clipboard-copy__button" aria-label="Copy" {{on "click" this.copyKey}}>
    <Ui::Ph @icon="copy" />
  </button>
</div>`,
  };

  classRows = [
    { name: 'nu-code', description: 'Inline code span on the alternate background.' },
    { name: 'nu-code.m-{variant}', description: 'Tinted inline code in any of the six variants.' },
    { name: 'nu-code-block', description: 'Bordered block container; its content is pinned to LTR because source never reflows with the page direction.' },
    { name: 'nu-code-block__header', description: 'Optional caption bar with a label and actions.' },
    { name: 'nu-code-block__actions', description: 'Trailing controls inside the header.' },
    { name: 'nu-code-block__content', description: 'The pre element: monospace, preserved whitespace, horizontal scroll.' },
    { name: 'nu-code-block.m-scrollable', description: 'Caps the content height at 20rem with vertical scroll.' },
    { name: 'nu-code-block__line', description: 'Wrap each line in this span to opt into line numbering.' },
    { name: 'nu-code-block.m-numbered', description: 'Numbers every __line with a CSS counter.' },
    { name: 'nu-clipboard-copy', description: 'Inline input-plus-button group for copyable values.' },
    { name: 'nu-clipboard-copy__input / __button / __feedback', description: 'The read-only value, the copy control, and the success text.' },
    { name: 'nu-clipboard-copy.is-copied', description: 'Colours the button with the feedback colour after a copy.' },
  ];
}
