import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/field', function (hooks) {
  setupRenderingTest(hooks);

  test('the label points at the yielded native control', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Bank Name">
        <input type="text" />
      </Nuvo::Field>
    `);

    const label = this.element.querySelector('.nu-field__label');
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
      <Nuvo::Field @label="Amount">
        <input type="text" id="my-own-id" />
      </Nuvo::Field>
    `);

    assert.dom('input').hasAttribute('id', 'my-own-id');
    assert
      .dom('.nu-field__label')
      .hasAttribute('for', 'my-own-id', 'the label follows the caller id');
  });

  test('a non-native control is labelled by reference', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Property">
        <button type="button" role="combobox">Select a property...</button>
      </Nuvo::Field>
    `);

    const label = this.element.querySelector('.nu-field__label');
    assert.dom('button').hasAttribute('aria-labelledby', label.id);
    assert
      .dom('.nu-field__label')
      .doesNotHaveAttribute('for', 'no dangling for on a non-native control');
  });

  test('a control that already carries its own label is left alone', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Property">
        <button type="button" role="combobox" aria-label="Pick one">x</button>
      </Nuvo::Field>
    `);

    assert.dom('button').hasAttribute('aria-label', 'Pick one');
    assert.dom('button').doesNotHaveAttribute('aria-labelledby');
  });

  test('a field with no label renders and wires nothing', async function (assert) {
    await render(hbs`
      <Nuvo::Field>
        <input type="text" />
      </Nuvo::Field>
    `);

    assert.dom('[data-test-nu-field]').exists();
    assert.dom('.nu-field__label').doesNotExist();
    assert.dom('input').doesNotHaveAttribute('id');
  });
});
