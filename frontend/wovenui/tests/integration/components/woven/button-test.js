import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/button', function (hooks) {
  setupRenderingTest(hooks);

  test('@text renders a label when invoked self-closing', async function (assert) {
    await render(hbs`<Woven::Button @variant="secondary" @text="AI: off" />`);

    assert.dom('[data-test-wu-button]').exists();
    assert.dom('.wu-btn__label').exists('label span is rendered');
    assert.dom('.wu-btn__label').hasText('AI: off');
  });

  test('block content renders a label', async function (assert) {
    await render(hbs`<Woven::Button @variant="primary">Send</Woven::Button>`);

    assert.dom('.wu-btn__label').hasText('Send');
  });

  test('@subtle adds m-subtle alongside the variant class', async function (assert) {
    await render(
      hbs`<Woven::Button @variant="danger" @subtle={{true}} @icon="trash" />`,
    );

    assert.dom('.wu-btn').hasClass('m-danger');
    assert.dom('.wu-btn').hasClass('m-subtle');
  });

  test('an icon-only self-closing button renders NO label span', async function (assert) {
    await render(hbs`<Woven::Button @variant="secondary" @icon="trash" />`);

    assert.dom('.wu-btn__icon').exists('icon span is rendered');
    assert.dom('.wu-btn__label').doesNotExist('no empty label span');
  });

  test('@icon with a phosphor name renders Woven::Icon inside the icon span', async function (assert) {
    await render(hbs`<Woven::Button @icon="trash" @text="Delete" />`);

    assert.dom('.wu-btn__icon i.ph.ph-trash').exists();
    assert.dom('.wu-btn__label').hasText('Delete');
  });

  test('@icon with a glyph renders the raw character', async function (assert) {
    await render(hbs`<Woven::Button @icon="★" @text="Star" />`);

    assert.dom('.wu-btn__icon').hasText('★');
    assert.dom('.wu-btn__icon i').doesNotExist();
  });

  test('a disabled button still renders its label', async function (assert) {
    await render(
      hbs`<Woven::Button @text="AI: off" @disabled={{true}} data-test-ai />`,
    );

    assert.dom('[data-test-ai]').isDisabled();
    assert.dom('.wu-btn__label').hasText('AI: off');
  });

  test('@href renders an anchor sharing the same innards', async function (assert) {
    await render(hbs`<Woven::Button @href="/x" @icon="eye" @text="View" />`);

    assert.dom('a.wu-btn').exists();
    assert.dom('a.wu-btn .wu-btn__label').hasText('View');
    assert.dom('a.wu-btn .wu-btn__icon i.ph.ph-eye').exists();
  });

  test('@shape drops the label entirely', async function (assert) {
    await render(
      hbs`<Woven::Button @shape="square" @icon="trash" @text="Delete" />`,
    );

    assert.dom('.wu-btn__icon').exists();
    assert.dom('.wu-btn__label').doesNotExist();
  });
});
