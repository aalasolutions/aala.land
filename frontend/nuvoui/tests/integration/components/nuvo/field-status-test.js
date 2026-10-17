import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const SLOT = '[data-test-nu-field-message]';

function errorId(root) {
  return root.querySelector('.nu-field__error')?.id;
}

function hintId(root) {
  return root.querySelector('.nu-field__hint')?.id;
}

module('Integration | Component | nuvo/field status', function (hooks) {
  setupRenderingTest(hooks);

  test('no status leaves the control unmarked', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Name"><Nuvo::Input /></Nuvo::Field>
    `);

    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('input').doesNotHaveAttribute('data-nu-field-status');
    assert.dom('input').doesNotHaveAttribute('aria-describedby');
    assert.dom(SLOT).exists('the message slot always renders');
    assert.dom(SLOT).hasAttribute('aria-live', 'polite');
    assert.dom(SLOT).hasNoText();
  });

  test('@error marks the control invalid and describes it', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Rent" @hint="Whole dirhams" @error="Enter a rent greater than 0">
        <Nuvo::Input />
      </Nuvo::Field>
    `);

    const id = errorId(this.element);
    assert.ok(id, 'the error has an id');
    assert.dom('input').hasAttribute('aria-invalid', 'true');
    assert.dom('input').hasAttribute('aria-describedby', id);
    assert
      .dom('[data-test-nu-field-error]')
      .hasText('Enter a rent greater than 0');
    assert
      .dom('[data-test-nu-field-error] .nu-field__message-icon')
      .exists('an icon precedes the error text');
    assert
      .dom('[data-test-nu-field-hint]')
      .doesNotExist('the error replaces the hint');
  });

  test('aria-describedby lists the hint id before a caller id', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Rent" @hint="Whole dirhams">
        <input type="text" aria-describedby="caller-note" />
      </Nuvo::Field>
    `);

    assert
      .dom('input')
      .hasAttribute('aria-describedby', `${hintId(this.element)} caller-note`);
  });

  test('@required sets aria-required on the control', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Name" @required={{true}}><Nuvo::Input /></Nuvo::Field>
    `);

    assert.dom('input').hasAttribute('aria-required', 'true');
    assert.dom('[data-test-nu-field-required]').exists();
  });

  test('the wiring follows @error, @hint and @required as they change', async function (assert) {
    this.error = null;
    this.required = false;
    await render(hbs`
      <Nuvo::Field
        @label="Rent"
        @hint="Whole dirhams"
        @error={{this.error}}
        @required={{this.required}}
      >
        <Nuvo::Input />
      </Nuvo::Field>
    `);

    const hint = hintId(this.element);
    assert.dom('input').hasAttribute('aria-describedby', hint);
    assert.dom('input').doesNotHaveAttribute('aria-invalid');

    this.set('error', 'Enter a rent greater than 0');
    this.set('required', true);
    await settled();
    assert.dom('input').hasAttribute('aria-invalid', 'true');
    assert.dom('input').hasAttribute('aria-describedby', errorId(this.element));
    assert.dom('input').hasAttribute('aria-required', 'true');

    this.set('error', null);
    this.set('required', false);
    await settled();
    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('input').hasAttribute('aria-describedby', hint);
    assert.dom('input').doesNotHaveAttribute('aria-required');
  });

  test('@status warning and success style the control without aria-invalid', async function (assert) {
    this.status = 'warning';
    await render(hbs`
      <Nuvo::Field @label="Rent" @hint="Above the area average" @status={{this.status}}>
        <Nuvo::Input />
      </Nuvo::Field>
    `);

    assert.dom('input').hasAttribute('data-nu-field-status', 'warning');
    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('[data-test-nu-field-hint]').hasClass('m-warning');

    this.set('status', 'success');
    await settled();
    assert.dom('input').hasAttribute('data-nu-field-status', 'success');
    assert.dom('[data-test-nu-field-hint]').hasClass('m-success');
  });

  test('@invalid aliases error and @valid aliases success', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="A" @invalid={{true}}><Nuvo::Input data-test-a /></Nuvo::Field>
      <Nuvo::Field @label="B" @valid={{true}}><Nuvo::Input data-test-b /></Nuvo::Field>
    `);

    assert.dom('[data-test-a]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-a]').hasAttribute('data-nu-field-status', 'error');
    assert.dom('[data-test-b]').hasAttribute('data-nu-field-status', 'success');
  });

  test('an explicit control status wins over the field', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Rent" @error="Enter a rent">
        <Nuvo::Input @status="success" />
      </Nuvo::Field>
    `);

    assert.dom('input').hasClass('is-valid');
    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('input').doesNotHaveAttribute('data-nu-field-status');
  });

  test('status reaches a checkbox, a select and a dropdown trigger', async function (assert) {
    this.options = ['One', 'Two'];
    await render(hbs`
      <Nuvo::Field @label="Agree" @error="Accept the terms to continue">
        <Nuvo::Checkbox @label="I agree" />
      </Nuvo::Field>
      <Nuvo::Field @label="Kind" @error="Choose a kind">
        <Nuvo::Select @options={{this.options}} />
      </Nuvo::Field>
      <Nuvo::Field @label="Status" @error="Choose a status">
        <Nuvo::Dropdown @options={{this.options}} />
      </Nuvo::Field>
    `);

    assert
      .dom('[data-test-nu-checkbox-input]')
      .hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-nu-select]').hasAttribute('aria-invalid', 'true');
    assert
      .dom('[data-test-nu-dropdown-trigger]')
      .hasAttribute('aria-invalid', 'true');
  });

  test('the message slot reserves the same height with and without a message', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Empty" data-test-empty><Nuvo::Input /></Nuvo::Field>
      <Nuvo::Field @label="Filled" @error="Enter a value" data-test-filled>
        <Nuvo::Input />
      </Nuvo::Field>
    `);

    const empty = this.element.querySelector(`[data-test-empty] ${SLOT}`);
    const filled = this.element.querySelector(`[data-test-filled] ${SLOT}`);
    const emptyMin = parseFloat(getComputedStyle(empty).minHeight);
    const filledMin = parseFloat(getComputedStyle(filled).minHeight);

    assert.ok(emptyMin > 0, 'the empty slot has a non-zero min-height');
    assert.strictEqual(emptyMin, filledMin, 'both slots reserve the same line');
    assert.strictEqual(
      empty.getBoundingClientRect().height,
      filled.getBoundingClientRect().height,
      'a one-line message does not change the slot height',
    );
  });

  test('the yielded hash carries the status and message ids', async function (assert) {
    await render(hbs`
      <Nuvo::Field @label="Rent" @error="Enter a rent" as |f|>
        <span data-test-out>{{f.status}} {{f.invalid}} {{f.describedBy}}</span>
      </Nuvo::Field>
    `);

    assert
      .dom('[data-test-out]')
      .hasText(`error true ${errorId(this.element)}`);
  });
});
