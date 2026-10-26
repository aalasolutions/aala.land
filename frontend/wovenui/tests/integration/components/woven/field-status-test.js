import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const SLOT = '[data-test-wu-field-message]';

function errorId(root) {
  return root.querySelector('.wu-field__error')?.id;
}

function hintId(root) {
  return root.querySelector('.wu-field__hint')?.id;
}

module('Integration | Component | woven/field status', function (hooks) {
  setupRenderingTest(hooks);

  test('no status leaves the control unmarked', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Name"><Woven::Input /></Woven::Field>
    `);

    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('input').doesNotHaveAttribute('data-wu-field-status');
    assert.dom('input').doesNotHaveAttribute('aria-describedby');
    assert.dom(SLOT).exists('the message slot always renders');
    assert.dom(SLOT).hasAttribute('aria-live', 'polite');
    assert.dom(SLOT).hasNoText();
  });

  test('@error marks the control invalid and describes it', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Rent" @hint="Whole dirhams" @error="Enter a rent greater than 0">
        <Woven::Input />
      </Woven::Field>
    `);

    const id = errorId(this.element);
    assert.ok(id, 'the error has an id');
    assert.dom('input').hasAttribute('aria-invalid', 'true');
    assert.dom('input').hasAttribute('aria-describedby', id);
    assert
      .dom('[data-test-wu-field-error]')
      .hasText('Enter a rent greater than 0');
    assert
      .dom('[data-test-wu-field-error] .wu-field__message-icon')
      .exists('an icon precedes the error text');
    assert
      .dom('[data-test-wu-field-hint]')
      .doesNotExist('the error replaces the hint');
  });

  test('aria-describedby lists the hint id before a caller id', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Rent" @hint="Whole dirhams">
        <input type="text" aria-describedby="caller-note" />
      </Woven::Field>
    `);

    assert
      .dom('input')
      .hasAttribute('aria-describedby', `${hintId(this.element)} caller-note`);
  });

  test('@required sets aria-required on the control', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Name" @required={{true}}><Woven::Input /></Woven::Field>
    `);

    assert.dom('input').hasAttribute('aria-required', 'true');
    assert.dom('[data-test-wu-field-required]').exists();
  });

  test('the wiring follows @error, @hint and @required as they change', async function (assert) {
    this.error = null;
    this.required = false;
    await render(hbs`
      <Woven::Field
        @label="Rent"
        @hint="Whole dirhams"
        @error={{this.error}}
        @required={{this.required}}
      >
        <Woven::Input />
      </Woven::Field>
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
      <Woven::Field @label="Rent" @hint="Above the area average" @status={{this.status}}>
        <Woven::Input />
      </Woven::Field>
    `);

    assert.dom('input').hasAttribute('data-wu-field-status', 'warning');
    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('[data-test-wu-field-hint]').hasClass('m-warning');

    this.set('status', 'success');
    await settled();
    assert.dom('input').hasAttribute('data-wu-field-status', 'success');
    assert.dom('[data-test-wu-field-hint]').hasClass('m-success');
  });

  test('@invalid aliases error and @valid aliases success', async function (assert) {
    await render(hbs`
      <Woven::Field @label="A" @invalid={{true}}><Woven::Input data-test-a /></Woven::Field>
      <Woven::Field @label="B" @valid={{true}}><Woven::Input data-test-b /></Woven::Field>
    `);

    assert.dom('[data-test-a]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-a]').hasAttribute('data-wu-field-status', 'error');
    assert.dom('[data-test-b]').hasAttribute('data-wu-field-status', 'success');
  });

  test('an explicit control status wins over the field', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Rent" @error="Enter a rent">
        <Woven::Input @status="success" />
      </Woven::Field>
    `);

    assert.dom('input').hasClass('is-valid');
    assert.dom('input').doesNotHaveAttribute('aria-invalid');
    assert.dom('input').doesNotHaveAttribute('data-wu-field-status');
  });

  test('status reaches a checkbox, a select and a dropdown trigger', async function (assert) {
    this.options = ['One', 'Two'];
    await render(hbs`
      <Woven::Field @label="Agree" @error="Accept the terms to continue">
        <Woven::Checkbox @label="I agree" />
      </Woven::Field>
      <Woven::Field @label="Kind" @error="Choose a kind">
        <Woven::Select @options={{this.options}} />
      </Woven::Field>
      <Woven::Field @label="Status" @error="Choose a status">
        <Woven::Dropdown @options={{this.options}} />
      </Woven::Field>
    `);

    assert
      .dom('[data-test-wu-checkbox-input]')
      .hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-wu-select]').hasAttribute('aria-invalid', 'true');
    assert
      .dom('[data-test-wu-dropdown-trigger]')
      .hasAttribute('aria-invalid', 'true');
  });

  test('the message slot reserves the same height with and without a message', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Empty" data-test-empty><Woven::Input /></Woven::Field>
      <Woven::Field @label="Filled" @error="Enter a value" data-test-filled>
        <Woven::Input />
      </Woven::Field>
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
      <Woven::Field @label="Rent" @error="Enter a rent" as |f|>
        <span data-test-out>{{f.status}} {{f.invalid}} {{f.describedBy}}</span>
      </Woven::Field>
    `);

    assert
      .dom('[data-test-out]')
      .hasText(`error true ${errorId(this.element)}`);
  });
});
