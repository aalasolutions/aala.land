import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const EMPTY_VALUES = [null, undefined, ''];

module('Integration | Component | woven/cell', function (hooks) {
  setupRenderingTest(hooks);

  test('Empty renders a muted dash', async function (assert) {
    await render(hbs`<Woven::Cell::Empty />`);

    assert.dom('[data-test-wu-cell-empty]').hasText('-').hasClass('text-muted');
  });

  test('Text', async function (assert) {
    await render(hbs`<Woven::Cell::Text @value="ada@example.com" />`);
    assert
      .dom('[data-test-wu-cell-text]')
      .hasText('ada@example.com')
      .hasClass('text-regular')
      .hasAttribute('title', 'ada@example.com');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(hbs`<Woven::Cell::Text @value={{this.value}} />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-text]').doesNotExist();
    }
  });

  test('Muted', async function (assert) {
    await render(hbs`<Woven::Cell::Muted @value="Note" />`);
    assert
      .dom('[data-test-wu-cell-muted]')
      .hasText('Note')
      .hasClass('text-muted');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(hbs`<Woven::Cell::Muted @value={{this.value}} />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-muted]').doesNotExist();
    }
  });

  test('Link', async function (assert) {
    this.owner.setupRouter();
    await render(
      hbs`<Woven::Cell::Link @value="Lease 7" @route="leases.detail" @model="7" />`,
    );
    assert
      .dom('[data-test-wu-cell-link]')
      .hasText('Lease 7')
      .hasClass('text-brand')
      .hasClass('whitespace-nowrap')
      .hasAttribute('href', '/leases/7');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(
        hbs`<Woven::Cell::Link @value={{this.value}} @route="leases.detail" @model="7" />`,
      );
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('a').doesNotExist('no link');
    }
  });

  test('Link shows @fallback as its text when the value is empty', async function (assert) {
    this.owner.setupRouter();
    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(
        hbs`<Woven::Cell::Link @value={{this.value}} @fallback="Untitled" @route="leases.detail" @model="7" />`,
      );
      assert
        .dom('[data-test-wu-cell-link]')
        .hasText('Untitled', `fallback: ${value}`)
        .hasAttribute('href', '/leases/7');
      assert.dom('[data-test-wu-cell-empty]').doesNotExist();
    }

    await render(
      hbs`<Woven::Cell::Link @value="Lease 7" @fallback="Untitled" @route="leases.detail" @model="7" />`,
    );
    assert.dom('[data-test-wu-cell-link]').hasText('Lease 7', 'value wins');
  });

  test('Link reads route and model from the column and row', async function (assert) {
    this.owner.setupRouter();
    this.column = { cellArgs: { route: 'leases.detail' } };
    this.row = { id: '9' };
    await render(
      hbs`<Woven::Cell::Link @value="Lease 9" @row={{this.row}} @column={{this.column}} />`,
    );

    assert.dom('[data-test-wu-cell-link]').hasAttribute('href', '/leases/9');
  });

  test('Link builds several route models from the column and row', async function (assert) {
    this.owner.setupRouter();
    this.column = {
      cellArgs: {
        route: 'properties.unit',
        modelPaths: ['unit.areaId', 'unit.id'],
      },
    };
    this.row = { id: '1', unit: { areaId: 'a1', id: 'u2' } };
    await render(
      hbs`<Woven::Cell::Link @value="101" @row={{this.row}} @column={{this.column}} data-test-out />`,
    );
    assert
      .dom('[data-test-wu-cell-link]')
      .hasText('101')
      .hasAttribute('href', '/properties/a1/unit/u2')
      .hasAttribute('data-test-out');

    await render(
      hbs`<Woven::Cell::Link @value="101" @route="properties.unit" @models={{array "a3" "u4"}} />`,
    );
    assert
      .dom('[data-test-wu-cell-link]')
      .hasAttribute('href', '/properties/a3/unit/u4', 'direct @models');
  });

  test('Person', async function (assert) {
    await render(hbs`<Woven::Cell::Person @name="Ada Lovelace" />`);
    assert
      .dom('[data-test-wu-cell-person]')
      .hasText('AL Ada Lovelace')
      .hasClass('whitespace-nowrap');
    assert.dom('[data-test-wu-cell-person] .wu-avatar').hasClass('sm');
    assert.dom('[data-test-wu-avatar-initials]').hasText('AL');
    assert
      .dom('[data-test-wu-cell-person-name]')
      .hasText('Ada Lovelace')
      .hasClass('overflow-label')
      .hasAttribute('title', 'Ada Lovelace');

    await render(
      hbs`<Woven::Cell::Person @name="Ada Lovelace" @initials="X" />`,
    );
    assert.dom('[data-test-wu-avatar-initials]').hasText('X');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(hbs`<Woven::Cell::Person @name={{this.value}} />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-person]').doesNotExist();
    }
  });

  test('Tag', async function (assert) {
    await render(hbs`<Woven::Cell::Tag @label="Active" @variant="success" />`);
    assert.dom('[data-test-wu-cell-tag]').hasText('Active').hasClass('wu-tag');
    assert
      .dom('[data-test-wu-cell-tag] .overflow-label')
      .hasAttribute('title', 'Active');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(hbs`<Woven::Cell::Tag @label={{this.value}} />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-tag]').doesNotExist();
    }
  });

  test('Number', async function (assert) {
    await render(hbs`<Woven::Cell::Number @value={{1234}} @locale="en-US" />`);
    assert
      .dom('[data-test-wu-cell-number]')
      .hasText('1,234')
      .hasClass('text-regular');

    await render(hbs`<Woven::Cell::Number @value={{0}} @locale="en-US" />`);
    assert.dom('[data-test-wu-cell-number]').hasText('0', 'zero is a value');

    for (const value of EMPTY_VALUES) {
      this.set('value', value);
      await render(hbs`<Woven::Cell::Number @value={{this.value}} />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-number]').doesNotExist();
    }
  });
});
