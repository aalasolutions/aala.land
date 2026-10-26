import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/icon slots', function (hooks) {
  setupRenderingTest(hooks);

  test('Button :icon replaces the built-in icon', async function (assert) {
    await render(hbs`
      <Woven::Button>
        <:icon><svg data-test-custom-icon></svg></:icon>
        <:default>Save</:default>
      </Woven::Button>
    `);

    assert.dom('.wu-btn__icon [data-test-custom-icon]').exists();
    assert.dom('.wu-btn__icon i.ph').doesNotExist('no Phosphor icon alongside');
    assert.dom('.wu-btn__label').hasText('Save');
  });

  test('Button :icon wins over @icon', async function (assert) {
    await render(hbs`
      <Woven::Button @icon="trash">
        <:icon><svg data-test-custom-icon></svg></:icon>
        <:default>Delete</:default>
      </Woven::Button>
    `);

    assert.dom('.wu-btn__icon [data-test-custom-icon]').exists();
    assert.dom('.wu-btn__icon i.ph-trash').doesNotExist();
  });

  test('Button loading still shows the spinner over a supplied :icon', async function (assert) {
    await render(hbs`
      <Woven::Button @loading={{true}}>
        <:icon><svg data-test-custom-icon></svg></:icon>
        <:default>Save</:default>
      </Woven::Button>
    `);

    assert.dom('.wu-btn__icon i.ph-spinner-gap').exists('spinner wins');
    assert.dom('.wu-btn__icon [data-test-custom-icon]').doesNotExist();
    assert.dom('.wu-btn__icon').hasClass('is-spinning');
  });

  test('Button without a :icon block is unchanged', async function (assert) {
    await render(hbs`<Woven::Button @icon="trash" @text="Delete" />`);

    assert.dom('.wu-btn__icon i.ph.ph-trash').exists();
    assert.dom('.wu-btn__label').hasText('Delete');
  });

  test('Button @iconPosition="end" honours the slot', async function (assert) {
    await render(hbs`
      <Woven::Button @iconPosition="end">
        <:icon><svg data-test-custom-icon></svg></:icon>
        <:default>Next</:default>
      </Woven::Button>
    `);

    assert.dom('.wu-btn__icon [data-test-custom-icon]').exists();
    assert
      .dom('.wu-btn > :last-child')
      .hasClass('wu-btn__icon', 'icon sits after the label');
  });

  test('Tabs :icon yields the tab', async function (assert) {
    this.tabs = [
      { id: 'a', label: 'First', icon: 'house' },
      { id: 'b', label: 'Second' },
    ];

    await render(hbs`
      <Woven::Tabs @tabs={{this.tabs}}>
        <:icon as |tab|><span data-test-tab-icon={{tab.id}}></span></:icon>
      </Woven::Tabs>
    `);

    assert.dom('[data-test-tab-icon="a"]').exists('slot receives the tab');
    assert.dom('[data-test-tab-icon="b"]').exists('yields for every tab');
    assert.dom('.wu-tabs__trigger i.ph').doesNotExist('built-in icon suppressed');
  });

  test('Segmented :icon yields the option', async function (assert) {
    this.options = [
      { id: 'grid', label: 'Grid', icon: 'squares-four' },
      { id: 'list', label: 'List', icon: 'list' },
    ];

    await render(hbs`
      <Woven::Segmented @options={{this.options}}>
        <:icon as |option|><span data-test-seg-icon={{option.id}}></span></:icon>
      </Woven::Segmented>
    `);

    assert.dom('[data-test-seg-icon="grid"]').exists();
    assert.dom('[data-test-seg-icon="list"]').exists();
    assert.dom('.wu-segmented__icon i.ph').doesNotExist();
  });

  test('Segmented without a block still renders option icons', async function (assert) {
    this.options = [{ id: 'grid', label: 'Grid', icon: 'squares-four' }];

    await render(hbs`<Woven::Segmented @options={{this.options}} />`);

    assert.dom('.wu-segmented__icon i.ph.ph-squares-four').exists();
  });
});
