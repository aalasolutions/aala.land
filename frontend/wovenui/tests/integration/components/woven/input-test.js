import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/input', function (hooks) {
  setupRenderingTest(hooks);

  test('@inputmode reaches the input', async function (assert) {
    await render(hbs`<Woven::Input @inputmode="numeric" />`);

    assert.dom('input').hasAttribute('inputmode', 'numeric');
    assert.dom('input').hasAttribute('type', 'text');
  });

  test('no inputmode attribute without @inputmode', async function (assert) {
    await render(hbs`<Woven::Input />`);

    assert.dom('input').doesNotHaveAttribute('inputmode');
  });

  test('@status sets data-wu-status, and aria-invalid only for errors', async function (assert) {
    await render(hbs`
      <Woven::Input @status="error" data-test-error />
      <Woven::Input @status="warning" data-test-warning />
      <Woven::Input @invalid={{true}} data-test-invalid />
      <Woven::Input @status="nonsense" data-test-unknown />
    `);

    assert.dom('[data-test-error]').hasAttribute('data-wu-status', 'error');
    assert.dom('[data-test-error]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-warning]').hasAttribute('data-wu-status', 'warning');
    assert.dom('[data-test-warning]').doesNotHaveAttribute('aria-invalid');
    assert.dom('[data-test-invalid]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-unknown]').hasClass('wu-input');
    assert.dom('[data-test-unknown]').doesNotHaveAttribute('aria-invalid');
    assert.dom('[data-test-unknown]').doesNotHaveAttribute('data-wu-status');
  });

  test('@onInput receives each value', async function (assert) {
    const seen = [];
    this.onInput = (value) => seen.push(value);
    await render(hbs`<Woven::Input @onInput={{this.onInput}} />`);

    await fillIn('input', '123');

    assert.deepEqual(seen, ['123']);
  });

  test('a plain input renders bare, affixes wrap it in wu-input-affix', async function (assert) {
    await render(hbs`<Woven::Input @size="xs" data-test-plain />`);
    assert.dom('[data-test-plain]').hasClass('wu-input');
    assert.dom('[data-test-plain]').hasClass('sm', 'xs folds into sm');
    assert.dom('[data-test-wu-input-affix]').doesNotExist();

    await render(
      hbs`<Woven::Input @size="lg" @prefixIcon="⌕" @clearable={{true}} @value="Bay" data-test-affixed />`,
    );
    assert.dom('[data-test-wu-input-affix]').hasClass('wu-input-affix');
    assert.dom('[data-test-wu-input-affix]').hasClass('lg', 'the size moves to the wrapper');
    assert.dom('[data-test-affixed]').doesNotHaveClass('lg');
    assert.dom('.wu-input-prefix').hasText('⌕');
    assert.dom('[data-test-wu-input-clear]').hasClass('wu-input-clear');
  });
});
