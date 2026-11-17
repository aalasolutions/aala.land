import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/field', function (hooks) {
  setupRenderingTest(hooks);

  test('the label points at the yielded native control', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Bank Name">
        <input type="text" />
      </Woven::Field>
    `);

    const label = this.element.querySelector('.wu-field-label');
    const input = this.element.querySelector('input');

    assert.ok(input.id, 'the control gets an id');
    assert.strictEqual(
      label.getAttribute('for'),
      input.id,
      'the label points at that id',
    );
  });

  test('an id the caller already set is kept', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Amount">
        <input type="text" id="my-own-id" />
      </Woven::Field>
    `);

    assert.dom('input').hasAttribute('id', 'my-own-id');
    assert
      .dom('.wu-field-label')
      .hasAttribute('for', 'my-own-id', 'the label follows the caller id');
  });

  test('a non-native control is labelled by reference', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Property">
        <button type="button" role="combobox">Select a property...</button>
      </Woven::Field>
    `);

    const label = this.element.querySelector('.wu-field-label');
    assert.dom('button').hasAttribute('aria-labelledby', label.id);
    assert
      .dom('.wu-field-label')
      .doesNotHaveAttribute('for', 'no dangling for on a non-native control');
  });

  test('a control that already carries its own label is left alone', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Property">
        <button type="button" role="combobox" aria-label="Pick one">x</button>
      </Woven::Field>
    `);

    assert.dom('button').hasAttribute('aria-label', 'Pick one');
    assert.dom('button').doesNotHaveAttribute('aria-labelledby');
  });

  test('a help button never stands in for the control', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Property" @tooltip="Pick the property this belongs to.">
        <button type="button" role="combobox">Select a property...</button>
      </Woven::Field>
    `);

    const label = this.element.querySelector('.wu-field-label');
    const control = this.element.querySelector('[role="combobox"]');
    const info = this.element.querySelector('[data-test-wu-field-help]');
    const popover = this.element.querySelector(
      '[data-test-wu-field-help-popover]',
    );

    assert.dom(control).hasAttribute('aria-labelledby', label.id);
    assert
      .dom(info)
      .doesNotHaveAttribute('aria-labelledby', 'the help button keeps its own name');
    assert
      .dom(info)
      .hasAttribute('aria-label', 'More information about Property');
    assert.dom(info).hasAttribute('popovertarget', popover.id);
    assert.dom(popover).hasAttribute('popover');
    assert.dom(popover).hasText('Pick the property this belongs to.');
  });

  test('a field with no label renders and wires nothing', async function (assert) {
    await render(hbs`
      <Woven::Field>
        <input type="text" />
      </Woven::Field>
    `);

    assert.dom('[data-test-wu-field]').exists();
    assert.dom('.wu-field-label').doesNotExist();
    assert.dom('input').doesNotHaveAttribute('id');
  });
});
