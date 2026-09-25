import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// The plus sign's position proves the visual order, which textContent alone cannot.
function plusIsAfterDigits(element) {
  const text = element.firstChild ?? element;
  const range = document.createRange();
  const node = text.nodeType === Node.TEXT_NODE ? text : text.firstChild;
  range.setStart(node, 0);
  range.setEnd(node, 1);
  const first = range.getBoundingClientRect().left;
  range.setStart(node, node.length - 1);
  range.setEnd(node, node.length);
  const last = range.getBoundingClientRect().left;
  return last > first;
}

module('Integration | Component | nuvo/badge', function (hooks) {
  setupRenderingTest(hooks);

  test('a plain badge above @max reads 99+ in RTL', async function (assert) {
    await render(
      hbs`<div dir="rtl"><Nuvo::Badge @value={{120}} @max={{99}} /></div>`,
    );

    const badge = document.querySelector('[data-test-nu-badge]');
    assert.dom(badge).hasText('99+');
    assert.dom('[data-test-nu-badge] bdi').hasAttribute('dir', 'ltr');
    assert.true(plusIsAfterDigits(badge.querySelector('bdi')));
  });

  test('a plain badge at or under @max and a text label are not wrapped', async function (assert) {
    await render(hbs`<div dir="rtl">
      <Nuvo::Badge @value={{7}} @max={{99}} class="under" />
      <Nuvo::Badge @text="جديد" @max={{99}} class="label" />
    </div>`);

    assert.dom('.under').hasText('7');
    assert.dom('.under bdi').doesNotExist();
    assert.dom('.label').hasText('جديد');
    assert.dom('.label bdi').doesNotExist();
  });

  test('a count badge above @max reads 99+ in RTL', async function (assert) {
    await render(
      hbs`<div dir="rtl"><Nuvo::Badge @count={{true}} @value={{150}} @max={{99}} /></div>`,
    );

    assert.dom('[data-test-nu-badge]').hasText('99+');
    assert.true(
      plusIsAfterDigits(document.querySelector('[data-test-nu-badge] bdi')),
    );
  });
});
