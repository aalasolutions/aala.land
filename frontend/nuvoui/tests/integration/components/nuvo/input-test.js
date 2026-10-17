import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/input', function (hooks) {
  setupRenderingTest(hooks);

  test('@inputmode reaches the input', async function (assert) {
    await render(hbs`<Nuvo::Input @inputmode="numeric" />`);

    assert.dom('input').hasAttribute('inputmode', 'numeric');
    assert.dom('input').hasAttribute('type', 'text');
  });

  test('no inputmode attribute without @inputmode', async function (assert) {
    await render(hbs`<Nuvo::Input />`);

    assert.dom('input').doesNotHaveAttribute('inputmode');
  });

  test('@status sets the class and aria-invalid only for errors', async function (assert) {
    await render(hbs`
      <Nuvo::Input @status="error" data-test-error />
      <Nuvo::Input @status="warning" data-test-warning />
      <Nuvo::Input @invalid={{true}} data-test-invalid />
      <Nuvo::Input @status="nonsense" data-test-unknown />
    `);

    assert.dom('[data-test-error]').hasClass('is-invalid');
    assert.dom('[data-test-error]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-warning]').hasClass('is-warning');
    assert.dom('[data-test-warning]').doesNotHaveAttribute('aria-invalid');
    assert.dom('[data-test-invalid]').hasAttribute('aria-invalid', 'true');
    assert.dom('[data-test-unknown]').hasClass('nu-input');
    assert.dom('[data-test-unknown]').doesNotHaveAttribute('aria-invalid');
  });

  test('@onInput receives each value', async function (assert) {
    const seen = [];
    this.onInput = (value) => seen.push(value);
    await render(hbs`<Nuvo::Input @onInput={{this.onInput}} />`);

    await fillIn('input', '123');

    assert.deepEqual(seen, ['123']);
  });
});
