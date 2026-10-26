import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/field-group', function (hooks) {
  setupRenderingTest(hooks);

  test('renders a fieldset with a legend and a message slot', async function (assert) {
    await render(hbs`
      <Woven::FieldGroup @label="Payment method" @required={{true}}>
        <Woven::Radio @name="pay" @value="cash" @label="Cash" />
        <Woven::Radio @name="pay" @value="cheque" @label="Cheque" />
      </Woven::FieldGroup>
    `);

    assert.dom('[data-test-wu-field-group]').hasTagName('fieldset');
    assert.dom('[data-test-wu-field-group-legend]').hasTagName('legend');
    assert
      .dom('[data-test-wu-field-group-legend]')
      .includesText('Payment method');
    assert.dom('[data-test-wu-field-group-required]').exists();
    const slot = this.element.querySelector(
      '[data-test-wu-field-group] [data-test-wu-field-message]',
    );
    assert.ok(slot, 'the message slot renders');
    assert.ok(
      parseFloat(getComputedStyle(slot).minHeight) > 0,
      'the slot reserves a line outside a Field too',
    );
  });

  test('status reaches every child control', async function (assert) {
    this.error = 'Choose a payment method';
    await render(hbs`
      <Woven::FieldGroup @label="Payment method" @error={{this.error}}>
        <Woven::Radio @name="pay" @value="cash" @label="Cash" />
        <Woven::Radio @name="pay" @value="cheque" @label="Cheque" />
      </Woven::FieldGroup>
    `);

    const radios = this.element.querySelectorAll('[data-test-wu-radio-input]');
    assert.strictEqual(radios.length, 2);
    radios.forEach((radio) => {
      assert.dom(radio).hasAttribute('aria-invalid', 'true');
    });
    const errorId = this.element.querySelector('.wu-field__error').id;
    assert
      .dom('[data-test-wu-field-group]')
      .hasAttribute('aria-describedby', errorId);

    this.set('error', null);
    await settled();
    radios.forEach((radio) => {
      assert.dom(radio).doesNotHaveAttribute('aria-invalid');
    });
    assert
      .dom('[data-test-wu-field-group]')
      .doesNotHaveAttribute('aria-describedby');
  });

  test('@status warning marks every checkbox', async function (assert) {
    await render(hbs`
      <Woven::FieldGroup @label="Amenities" @status="warning" @hint="Pick at least one">
        <Woven::Checkbox @label="Pool" />
        <Woven::Checkbox @label="Gym" />
      </Woven::FieldGroup>
    `);

    this.element
      .querySelectorAll('[data-test-wu-checkbox-input]')
      .forEach((box) => {
        assert.dom(box).hasAttribute('data-wu-field-status', 'warning');
        assert.dom(box).doesNotHaveAttribute('aria-invalid');
      });
  });
});
