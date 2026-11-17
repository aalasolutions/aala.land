import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const ICON = '[data-test-wu-button-icon]';

module('Integration | Component | woven/button', function (hooks) {
  setupRenderingTest(hooks);

  test('@text renders the label when invoked self-closing', async function (assert) {
    await render(hbs`<Woven::Button @variant="secondary" @text="AI: off" />`);

    assert.dom('[data-test-wu-button]').exists();
    assert.dom('[data-test-wu-button]').hasText('AI: off');
  });

  test('block content renders the label', async function (assert) {
    await render(hbs`<Woven::Button @variant="brand">Send</Woven::Button>`);

    assert.dom('[data-test-wu-button]').hasText('Send');
  });

  test('variants map to CSS kit modifiers', async function (assert) {
    const cases = [
      ['brand', 'brand'],
      ['danger', 'danger'],
      ['secondary', 'subtle'],
      ['ghost', 'quiet'],
      ['link', 'link'],
    ];
    for (const [variant, modifier] of cases) {
      this.set('variant', variant);
      await render(hbs`<Woven::Button @variant={{this.variant}} @text="Go" />`);
      assert.dom('.wu-btn').hasClass(modifier, `${variant} renders ${modifier}`);
    }
  });

  test('success, warning, info and unknown variants render no modifier', async function (assert) {
    for (const variant of ['success', 'warning', 'info', 'primary']) {
      this.set('variant', variant);
      await render(hbs`<Woven::Button @variant={{this.variant}} @text="Go" />`);
      assert.dom('.wu-btn').hasAttribute('class', 'wu-btn', `${variant} renders the default button`);
    }
  });

  test('sizes fold into sm and lg', async function (assert) {
    const cases = { xs: 'sm', sm: 'sm', lg: 'lg', xl: 'lg' };
    for (const [size, modifier] of Object.entries(cases)) {
      this.set('size', size);
      await render(hbs`<Woven::Button @size={{this.size}} @text="Go" />`);
      assert.dom('.wu-btn').hasClass(modifier, `${size} renders ${modifier}`);
    }
    await render(hbs`<Woven::Button @size="md" @text="Go" />`);
    assert.dom('.wu-btn').hasAttribute('class', 'wu-btn', 'md is the default');
  });

  test('@subtle adds subtle alongside the variant class', async function (assert) {
    await render(
      hbs`<Woven::Button @variant="danger" @subtle={{true}} @icon="trash" />`,
    );

    assert.dom('.wu-btn').hasClass('danger');
    assert.dom('.wu-btn').hasClass('subtle');
  });

  test('shapes map to icon and round', async function (assert) {
    await render(hbs`<Woven::Button @shape="square" @icon="trash" aria-label="Delete" />`);
    assert.dom('.wu-btn').hasClass('icon');
    assert.dom('.wu-btn').doesNotHaveClass('round');

    await render(hbs`<Woven::Button @shape="circle" @icon="x" aria-label="Close" />`);
    assert.dom('.wu-btn').hasClass('icon');
    assert.dom('.wu-btn').hasClass('round');
  });

  test('state lives in attributes, not classes', async function (assert) {
    await render(hbs`<Woven::Button @active={{true}} @text="Week" />`);
    assert.dom('.wu-btn').hasAttribute('aria-pressed', 'true');

    await render(hbs`<Woven::Button @active={{false}} @text="Day" />`);
    assert.dom('.wu-btn').hasAttribute('aria-pressed', 'false');

    await render(hbs`<Woven::Button @text="Plain" />`);
    assert.dom('.wu-btn').doesNotHaveAttribute('aria-pressed');

    await render(hbs`<Woven::Button @loading={{true}} @text="Saving" />`);
    assert.dom('.wu-btn').hasAttribute('aria-busy', 'true');
    assert.dom('.wu-btn').isDisabled('loading keeps the button disabled');
  });

  test('an icon-only self-closing button renders only the icon', async function (assert) {
    await render(hbs`<Woven::Button @variant="secondary" @icon="trash" />`);

    assert.dom(ICON).exists('icon span is rendered');
    assert.dom('[data-test-wu-button]').hasText('');
  });

  test('@icon with a phosphor name renders Woven::Icon inside the icon span', async function (assert) {
    await render(hbs`<Woven::Button @icon="trash" @text="Delete" />`);

    assert.dom(`${ICON} i.ph.ph-trash`).exists();
    assert.dom('[data-test-wu-button]').hasText('Delete');
  });

  test('@icon with a glyph renders the raw character', async function (assert) {
    await render(hbs`<Woven::Button @icon="★" @text="Star" />`);

    assert.dom(ICON).hasText('★');
    assert.dom(`${ICON} i`).doesNotExist();
  });

  test('a disabled button still renders its label', async function (assert) {
    await render(
      hbs`<Woven::Button @text="AI: off" @disabled={{true}} data-test-ai />`,
    );

    assert.dom('[data-test-ai]').isDisabled();
    assert.dom('[data-test-ai]').hasText('AI: off');
  });

  test('@href renders an anchor sharing the same innards', async function (assert) {
    await render(hbs`<Woven::Button @href="/x" @icon="eye" @text="View" />`);

    assert.dom('a.wu-btn').exists();
    assert.dom('a.wu-btn').hasText('View');
    assert.dom(`a.wu-btn ${ICON} i.ph.ph-eye`).exists();
  });

  test('a disabled anchor carries aria-disabled', async function (assert) {
    await render(hbs`<Woven::Button @href="/x" @disabled={{true}} @text="View" />`);

    assert.dom('a.wu-btn').hasAttribute('aria-disabled', 'true');
  });

  test('an anchor carries the test hook, and a disabled one leaves the tab order and does not navigate', async function (assert) {
    await render(hbs`<Woven::Button @href="#wu-nav-target" @text="View" />`);
    assert.dom('a.wu-btn').hasAttribute('data-test-wu-button');
    assert.dom('a.wu-btn').doesNotHaveAttribute('tabindex');

    await render(hbs`<Woven::Button @href="#wu-nav-target" @disabled={{true}} @text="View" />`);
    assert.dom('a.wu-btn').hasAttribute('tabindex', '-1');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a.wu-btn').dispatchEvent(event);
    assert.true(event.defaultPrevented, 'the click is cancelled');
  });

  test('a loading button shows the spinner even with the icon at the end', async function (assert) {
    await render(hbs`<Woven::Button @icon="eye" @iconPosition="end" @loading={{true}} @text="Save" />`);

    assert.dom(ICON).exists({ count: 1 });
    assert.dom(ICON).hasClass('wu-spinner');
  });

  test('@shape drops the label entirely', async function (assert) {
    await render(
      hbs`<Woven::Button @shape="square" @icon="trash" @text="Delete" />`,
    );

    assert.dom(ICON).exists();
    assert.dom('[data-test-wu-button]').hasText('');
  });
});
