import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module('Integration | Component | whatsapp/message-text', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.confirms = [];
    const confirms = this.confirms;
    this.owner.register(
      'service:dialogs',
      class extends Service {
        confirm(options) {
          confirms.push(options);
          return Promise.resolve(false);
        }
      },
    );
  });

  test('renders links with safe attributes and keeps the rest as text', async function (assert) {
    this.set('text', 'Unit list https://aala.land/units here');
    await render(hbs`<Whatsapp::MessageText @text={{this.text}} />`);

    assert
      .dom('[data-test-wa-message-link]')
      .hasAttribute('href', 'https://aala.land/units')
      .hasAttribute('target', '_blank')
      .hasAttribute('rel', 'noopener noreferrer nofollow');
    assert.dom(this.element).hasText('Unit list https://aala.land/units here');
  });

  test('message text is never parsed as HTML', async function (assert) {
    this.set('text', '<img src=x onerror=alert(1)> hi');
    await render(hbs`<Whatsapp::MessageText @text={{this.text}} />`);

    assert.dom('img').doesNotExist();
    assert.dom(this.element).hasText('<img src=x onerror=alert(1)> hi');
  });

  test('a customer link asks before opening and names the real domain', async function (assert) {
    this.set('text', 'pay here https://paypa1-secure.com/x');
    await render(
      hbs`<Whatsapp::MessageText @text={{this.text}} @isExternal={{true}} />`,
    );
    await click('[data-test-wa-message-link]');

    assert.strictEqual(this.confirms.length, 1);
    assert.true(this.confirms[0].message.includes('paypa1-secure.com'));
  });

  test('our own link opens without a confirm', async function (assert) {
    this.set('text', 'https://aala.land');
    await render(
      hbs`<Whatsapp::MessageText @text={{this.text}} @isExternal={{false}} />`,
    );
    const link = this.element.querySelector('[data-test-wa-message-link]');
    link.addEventListener('click', (event) => event.preventDefault());
    await click(link);

    assert.strictEqual(this.confirms.length, 0);
  });

  test('a middle-click on a customer link also asks first', async function (assert) {
    this.set('text', 'https://example.com');
    await render(
      hbs`<Whatsapp::MessageText @text={{this.text}} @isExternal={{true}} />`,
    );
    await triggerEvent('[data-test-wa-message-link]', 'auxclick', {
      button: 1,
    });

    assert.strictEqual(this.confirms.length, 1);
  });
});
