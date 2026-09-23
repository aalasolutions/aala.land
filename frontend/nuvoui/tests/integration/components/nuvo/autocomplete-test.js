import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click, fillIn, focus } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const FILTER = '[data-test-nu-dropdown-filter]';

function menu() {
  return document.querySelector('.nu-menu.is-open');
}

function labels() {
  return [...menu().querySelectorAll('[data-test-nu-dropdown-item]')].map(
    (el) => el.textContent.trim(),
  );
}

module('Integration | Component | nuvo/autocomplete', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.items = [
      { id: '1', name: 'Al Hafiz Shopping Mall' },
      { id: '2', name: 'Bay Tower' },
    ];
    this.startsWith = (options, term) =>
      options.filter((o) => o.label.toLowerCase().startsWith(term));
  });

  test('@options lists every item before anything is typed', async function (assert) {
    await render(hbs`<Nuvo::Autocomplete @options={{this.items}} />`);

    await focus(FILTER);

    assert.deepEqual(labels(), ['Al Hafiz Shopping Mall', 'Bay Tower']);
  });

  test('@filter replaces the built-in match for local options', async function (assert) {
    await render(
      hbs`<Nuvo::Autocomplete @options={{this.items}} @filter={{this.startsWith}} />`,
    );

    await fillIn(FILTER, 'bay');

    assert.deepEqual(labels(), ['Bay Tower']);
  });

  test('a local list still offers create and hands back the created item', async function (assert) {
    this.onCreate = async (term) => ({ id: '3', name: term });
    this.onSelect = (item) => (this.selected = item);
    await render(hbs`
      <Nuvo::Autocomplete
        @options={{this.items}}
        @onCreate={{this.onCreate}}
        @onSelect={{this.onSelect}}
      />
    `);

    await fillIn(FILTER, 'Marina Heights');
    const createRow = [
      ...menu().querySelectorAll('[data-test-nu-dropdown-item]'),
    ].find((el) => el.textContent.includes('Marina Heights'));
    await click(createRow);

    assert.deepEqual(this.selected, { id: '3', name: 'Marina Heights' });
  });
});
