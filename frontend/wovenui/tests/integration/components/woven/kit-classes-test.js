import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render, triggerKeyEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/CSS kit classes', function (hooks) {
  setupRenderingTest(hooks);

  test('badge renders roles, drops secondary, and keeps solid', async function (assert) {
    await render(hbs`<Woven::Badge @variant="brand" @solid={{true}} @text="New" />`);
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-badge brand solid');

    await render(hbs`<Woven::Badge @variant="secondary" @size="sm" @text="Draft" />`);
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-badge');
  });

  test('count badges are solid, danger when no variant is passed', async function (assert) {
    await render(hbs`<Woven::Badge @count={{true}} @value={{3}} />`);
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-badge solid danger');

    await render(hbs`<Woven::Badge @count={{true}} @variant="success" @value={{3}} />`);
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-badge solid success');
  });

  test('a wrapping badge pins a corner bubble to a badge host', async function (assert) {
    await render(hbs`<Woven::Badge @value={{2}}><button type="button">Inbox</button></Woven::Badge>`);
    assert.dom('[data-test-wu-badge-wrap]').hasClass('wu-badge-host');
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-badge solid danger corner');

    await render(hbs`<Woven::Badge @isDot={{true}} @variant="brand"><button type="button">Inbox</button></Woven::Badge>`);
    assert.dom('[data-test-wu-badge]').hasAttribute('class', 'wu-dot brand corner');
  });

  test('tag maps variants to kit role modifiers', async function (assert) {
    const cases = {
      brand: 'brand',
      secondary: 'gray',
      success: 'success',
      warning: 'warning',
      danger: 'danger',
      info: 'info',
    };
    for (const [variant, modifier] of Object.entries(cases)) {
      this.set('variant', variant);
      await render(hbs`<Woven::Tag @variant={{this.variant}} @text="Tag" />`);
      assert.dom('[data-test-wu-tag]').hasAttribute('class', `wu-tag ${modifier}`);
    }

    await render(hbs`<Woven::Tag @variant="unknown" @text="Tag" />`);
    assert.dom('[data-test-wu-tag]').hasAttribute('class', 'wu-tag');
  });

  test('tag remove button uses the kit part', async function (assert) {
    await render(hbs`<Woven::Tag @closable={{true}} @text="Tag" />`);
    assert.dom('[data-test-wu-tag-remove]').hasClass('wu-tag-remove');
    assert.dom('[data-test-wu-tag-remove]').hasAttribute('aria-label', 'Remove Tag');

    await render(hbs`<Woven::Tag @closable={{true}} @removeLabel="Remove filter">Rent</Woven::Tag>`);
    assert.dom('[data-test-wu-tag-remove]').hasAttribute('aria-label', 'Remove filter');
  });

  test('dot renders roles and animated for pulse', async function (assert) {
    await render(hbs`<Woven::Dot @variant="success" @pulse={{true}} @size="lg" @ring={{true}} />`);
    assert.dom('[data-test-wu-dot]').hasAttribute('class', 'wu-dot success animated');

    await render(hbs`<Woven::Dot @variant="secondary" />`);
    assert.dom('[data-test-wu-dot]').hasAttribute('class', 'wu-dot');
  });

  test('avatar maps size, tile and status', async function (assert) {
    await render(hbs`<Woven::Avatar @size="xl" @square={{true}} @status="success" @initials="AB" />`);
    assert.dom('[data-test-wu-avatar]').hasAttribute('class', 'wu-avatar lg tile');
    assert.dom('[data-test-wu-avatar]').hasAttribute('data-status', 'online');

    const statuses = { warning: 'away', danger: 'busy', info: 'offline', brand: 'offline' };
    for (const [status, value] of Object.entries(statuses)) {
      this.set('status', status);
      await render(hbs`<Woven::Avatar @status={{this.status}} @initials="AB" />`);
      assert.dom('[data-test-wu-avatar]').hasAttribute('data-status', value);
    }

    await render(hbs`<Woven::Avatar @initials="AB" />`);
    assert.dom('[data-test-wu-avatar]').doesNotHaveAttribute('data-status');
  });

  test('avatar is named with its status, as the kit asks', async function (assert) {
    await render(hbs`<Woven::Avatar @initials="AB" @alt="Test User" @status="success" />`);
    assert.dom('[data-test-wu-avatar]').hasAttribute('role', 'img');
    assert.dom('[data-test-wu-avatar]').hasAttribute('aria-label', 'Test User, online');

    await render(hbs`<Woven::Avatar @initials="AB" />`);
    assert.dom('[data-test-wu-avatar]').hasAttribute('aria-label', 'AB');

    await render(hbs`<Woven::Avatar @src="/avatar.png" @alt="Test User" @status="danger" />`);
    assert.dom('[data-test-wu-avatar]').doesNotHaveAttribute('role');
    assert.dom('[data-test-wu-avatar-image]').hasAttribute('alt', 'Test User, busy');
  });

  test('spinner folds sizes and drops variants', async function (assert) {
    await render(hbs`<Woven::Spinner @size="xs" @variant="brand" />`);
    assert.dom('[data-test-wu-spinner]').hasAttribute('class', 'wu-spinner sm');
  });

  test('btn group joins buttons only when attached', async function (assert) {
    await render(hbs`<Woven::BtnGroup @attached={{true}} />`);
    assert.dom('[data-test-wu-btn-group]').hasAttribute('class', 'wu-btn-group');

    await render(hbs`<Woven::BtnGroup />`);
    assert.dom('[data-test-wu-btn-group]').doesNotHaveClass('wu-btn-group');
  });

  test('field renders the kit label, modifiers and message parts', async function (assert) {
    await render(hbs`
      <Woven::Field @label="Rent" @horizontal={{true}} @hint="Whole dirhams">
        <Woven::Input />
      </Woven::Field>
    `);
    assert.dom('[data-test-wu-field]').hasAttribute('class', 'wu-field live horizontal');
    assert.dom('[data-test-wu-field] > .wu-field-label').hasText('Rent');
    assert.dom('[data-test-wu-field-hint]').hasAttribute('class', 'wu-field-message');

    await render(hbs`
      <Woven::Field @label="Rent" @error="Enter a rent"><Woven::Input /></Woven::Field>
    `);
    assert.dom('[data-test-wu-field-error]').hasAttribute('class', 'wu-field-message error');

    await render(hbs`
      <Woven::Field @label="Rent" @tooltip="Monthly">
        <Woven::Input />
      </Woven::Field>
    `);
    assert.dom('.wu-field-label-row > .wu-field-label').hasText('Rent');
    assert.dom('.wu-field-label-row > [data-test-wu-field-help]').hasClass('wu-field-help');
    assert.dom('[data-test-wu-field-help-popover]').hasClass('wu-popover');
  });

  test('form actions map end to trailing and between to core flex utilities', async function (assert) {
    await render(hbs`<Woven::FormActions @align="end">x</Woven::FormActions>`);
    assert.dom('[data-test-wu-form-actions]').hasAttribute('class', 'wu-form-actions trailing');

    await render(hbs`<Woven::FormActions @align="between">x</Woven::FormActions>`);
    assert.dom('[data-test-wu-form-actions]').hasAttribute('class', 'wu-form-actions flex between');
  });

  test('field group renders the kit legend', async function (assert) {
    await render(hbs`<Woven::FieldGroup @label="Amenities" />`);
    assert.dom('[data-test-wu-field-group]').hasAttribute('class', 'wu-field-group');
    assert.dom('[data-test-wu-field-group-legend]').hasClass('wu-field-group-legend');
  });

  test('segmented renders kit radio items and keeps arrow keys', async function (assert) {
    this.options = [
      { id: 'day', label: 'Day' },
      { id: 'week', label: 'Week' },
      { id: 'month', label: 'Month', disabled: true },
    ];
    this.value = 'day';
    this.onChange = (value) => this.set('value', value);
    await render(hbs`
      <Woven::Segmented @options={{this.options}} @value={{this.value}} @onChange={{this.onChange}} @size="xs" @fill={{true}} />
    `);

    assert.dom('[data-test-wu-segmented]').hasAttribute('class', 'wu-segmented sm w-full');
    assert.dom('[data-test-wu-segmented-item="day"]').hasClass('wu-segmented-item');
    assert.dom('[data-test-wu-segmented-item="day"] .wu-segmented-input').isChecked();
    assert.dom('[data-test-wu-segmented-item="month"] .wu-segmented-input').isDisabled();

    await click('[data-test-wu-segmented-item="week"]');
    assert.strictEqual(this.value, 'week', 'a click on the item selects it');
    assert.dom('[data-test-wu-segmented-item="week"] .wu-segmented-input').isChecked();

    await triggerKeyEvent('[data-test-wu-segmented]', 'keydown', 'Home');
    assert.strictEqual(this.value, 'day', 'Home moves to the first enabled segment');
    await triggerKeyEvent('[data-test-wu-segmented]', 'keydown', 'ArrowLeft');
    assert.strictEqual(this.value, 'week', 'arrows wrap and skip disabled segments');
  });

  test('segmented iconOnly keeps the label for screen readers', async function (assert) {
    this.options = [{ id: 'grid', label: 'Grid', icon: 'squares-four' }];
    await render(hbs`<Woven::Segmented @options={{this.options}} @iconOnly={{true}} />`);
    assert.dom('.wu-segmented-label').hasClass('sr-only');
    assert.dom('[data-test-wu-segmented-item="grid"]').hasAttribute('title', 'Grid');
  });
});
