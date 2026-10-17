import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/field-group', function (hooks) {
  setupRenderingTest(hooks);

  test('renders a fieldset with a legend and a message slot', async function (assert) {
    await render(hbs`
      <Nuvo::FieldGroup @label="Payment method" @required={{true}}>
        <Nuvo::Radio @name="pay" @value="cash" @label="Cash" />
        <Nuvo::Radio @name="pay" @value="cheque" @label="Cheque" />
      </Nuvo::FieldGroup>
    `);

    assert.dom('[data-test-nu-field-group]').hasTagName('fieldset');
    assert.dom('[data-test-nu-field-group-legend]').hasTagName('legend');
    assert
      .dom('[data-test-nu-field-group-legend]')
      .includesText('Payment method');
    assert.dom('[data-test-nu-field-group-required]').exists();
    const slot = this.element.querySelector(
      '[data-test-nu-field-group] [data-test-nu-field-message]',
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
      <Nuvo::FieldGroup @label="Payment method" @error={{this.error}}>
        <Nuvo::Radio @name="pay" @value="cash" @label="Cash" />
        <Nuvo::Radio @name="pay" @value="cheque" @label="Cheque" />
      </Nuvo::FieldGroup>
    `);

    const radios = this.element.querySelectorAll('[data-test-nu-radio-input]');
    assert.strictEqual(radios.length, 2);
    radios.forEach((radio) => {
      assert.dom(radio).hasAttribute('aria-invalid', 'true');
    });
    const errorId = this.element.querySelector('.nu-field__error').id;
    assert
      .dom('[data-test-nu-field-group]')
      .hasAttribute('aria-describedby', errorId);

    this.set('error', null);
    await settled();
    radios.forEach((radio) => {
      assert.dom(radio).doesNotHaveAttribute('aria-invalid');
    });
    assert
      .dom('[data-test-nu-field-group]')
      .doesNotHaveAttribute('aria-describedby');
  });

  test('@status warning marks every checkbox', async function (assert) {
    await render(hbs`
      <Nuvo::FieldGroup @label="Amenities" @status="warning" @hint="Pick at least one">
        <Nuvo::Checkbox @label="Pool" />
        <Nuvo::Checkbox @label="Gym" />
      </Nuvo::FieldGroup>
    `);

    this.element
      .querySelectorAll('[data-test-nu-checkbox-input]')
      .forEach((box) => {
        assert.dom(box).hasAttribute('data-nu-field-status', 'warning');
        assert.dom(box).doesNotHaveAttribute('aria-invalid');
      });
  });
});
