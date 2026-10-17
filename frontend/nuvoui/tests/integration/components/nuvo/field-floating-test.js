import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn, select } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const LABEL = '.nu-field__float-label';
const WRAPPER = '[data-test-nu-field-control]';

// Reads the label offset after jumping any running transition to its end.
function labelTop(root) {
  const label = root.querySelector(LABEL);
  getComputedStyle(label).insetBlockStart;
  label.getAnimations().forEach((animation) => animation.finish());
  return parseFloat(getComputedStyle(label).insetBlockStart);
}

module('Integration | Component | nuvo/field floating label', function (hooks) {
  setupRenderingTest(hooks);

  test('@placeholder without @label renders a label wired to the control', async function (assert) {
    await render(hbs`
      <Nuvo::Field @placeholder="Property name"><Nuvo::Input /></Nuvo::Field>
    `);

    const input = this.element.querySelector('input');
    assert.dom('[data-test-nu-field]').hasClass('m-floating');
    assert.dom('.nu-field__label').doesNotExist('no static label');
    assert.dom(LABEL).hasTagName('label');
    assert.dom(LABEL).hasText('Property name');
    assert.ok(input.id, 'the control gets an id');
    assert.dom(LABEL).hasAttribute('for', input.id);
    assert.dom('input').hasAttribute('placeholder', ' ');
  });

  test('@label keeps the static label', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Name" @placeholder="Ignored"><Nuvo::Input @placeholder="Jane" /></Nuvo::Field>
    `);

    assert.dom('.nu-field__label').hasText('Name');
    assert.dom(LABEL).doesNotExist();
    assert.dom('input').hasAttribute('placeholder', 'Jane');
  });

  test('the label floats once the control has a value', async function (assert) {
    await render(hbs`
      <Nuvo::Field @placeholder="Property name"><Nuvo::Input /></Nuvo::Field>
    `);

    const resting = labelTop(this.element);
    assert.dom(WRAPPER).doesNotHaveClass('has-value');

    await fillIn('input', 'Marina Tower');
    assert.dom(WRAPPER).hasClass('has-value');
    assert.ok(labelTop(this.element) < resting, 'the label moved up');
    assert.strictEqual(labelTop(this.element), 0, 'it sits on the top edge');
  });

  test('a select uses the has-value fallback', async function (assert) {
    this.options = [
      { value: 'villa', label: 'Villa' },
      { value: 'flat', label: 'Flat' },
    ];
    await render(hbs`
      <Nuvo::Field @placeholder="Kind" as |f|>
        <Nuvo::Select @options={{this.options}} @placeholder={{f.placeholder}} />
      </Nuvo::Field>
    `);

    const control = this.element.querySelector('select');
    assert.dom(LABEL).hasAttribute('for', control.id);
    assert.dom(WRAPPER).doesNotHaveClass('has-value', 'empty option selected');

    await select('select', 'flat');
    assert.dom(WRAPPER).hasClass('has-value');
  });

  test('a textarea gets the floating label', async function (assert) {
    await render(hbs`
      <Nuvo::Field @placeholder="Notes"><Nuvo::Textarea /></Nuvo::Field>
    `);

    const control = this.element.querySelector('textarea');
    assert.dom(LABEL).hasAttribute('for', control.id);
    assert.dom('textarea').hasAttribute('placeholder', ' ');
  });

  test('an autocomplete filter input gets the floating label', async function (assert) {
    this.items = [{ id: '1', name: 'Bay Tower' }];
    await render(hbs`
      <Nuvo::Field @placeholder="Building" as |f|>
        <Nuvo::Autocomplete @options={{this.items}} @placeholder={{f.placeholder}} />
      </Nuvo::Field>
    `);

    const control = this.element.querySelector(
      '[data-test-nu-dropdown-filter]',
    );
    assert.dom(LABEL).hasAttribute('for', control.id);
    assert.dom(control).hasAttribute('placeholder', ' ');
  });
});
