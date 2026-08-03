import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/button', function (hooks) {
  setupRenderingTest(hooks);

  test('@text renders a label when invoked self-closing', async function (assert) {
    await render(hbs`<Nuvo::Button @variant="secondary" @text="AI: off" />`);

    assert.dom('[data-test-nu-button]').exists();
    assert.dom('.nu-btn__label').exists('label span is rendered');
    assert.dom('.nu-btn__label').hasText('AI: off');
  });

  test('block content renders a label', async function (assert) {
    await render(hbs`<Nuvo::Button @variant="primary">Send</Nuvo::Button>`);

    assert.dom('.nu-btn__label').hasText('Send');
  });

  test('an icon-only self-closing button renders NO label span', async function (assert) {
    await render(hbs`<Nuvo::Button @variant="secondary" @icon="trash" />`);

    assert.dom('.nu-btn__icon').exists('icon span is rendered');
    assert.dom('.nu-btn__label').doesNotExist('no empty label span');
  });

  test('@icon with a phosphor name renders Ui::Ph inside the icon span', async function (assert) {
    await render(hbs`<Nuvo::Button @icon="trash" @text="Delete" />`);

    assert.dom('.nu-btn__icon i.ph.ph-trash').exists();
    assert.dom('.nu-btn__label').hasText('Delete');
  });

  test('@icon with a glyph renders the raw character', async function (assert) {
    await render(hbs`<Nuvo::Button @icon="★" @text="Star" />`);

    assert.dom('.nu-btn__icon').hasText('★');
    assert.dom('.nu-btn__icon i').doesNotExist();
  });

  test('a disabled button still renders its label', async function (assert) {
    await render(
      hbs`<Nuvo::Button @text="AI: off" @disabled={{true}} data-test-ai />`,
    );

    assert.dom('[data-test-ai]').isDisabled();
    assert.dom('.nu-btn__label').hasText('AI: off');
  });

  test('@href renders an anchor sharing the same innards', async function (assert) {
    await render(hbs`<Nuvo::Button @href="/x" @icon="eye" @text="View" />`);

    assert.dom('a.nu-btn').exists();
    assert.dom('a.nu-btn .nu-btn__label').hasText('View');
    assert.dom('a.nu-btn .nu-btn__icon i.ph.ph-eye').exists();
  });

  test('@shape drops the label entirely', async function (assert) {
    await render(
      hbs`<Nuvo::Button @shape="square" @icon="trash" @text="Delete" />`,
    );

    assert.dom('.nu-btn__icon').exists();
    assert.dom('.nu-btn__label').doesNotExist();
  });
});
