import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | whatsapp/message-body', function (hooks) {
  setupRenderingTest(hooks);

  test('an edited message shows the current text and the labeled original', async function (assert) {
    this.set('message', {
      body: 'Viewing at *5*',
      originalBody: 'Viewing at 4',
      editedAt: 1700000100,
      fromMe: false,
    });
    await render(
      hbs`<Whatsapp::MessageBody @message={{this.message}} data-test-body />`,
    );

    assert.dom('[data-test-body]').hasText('Viewing at 5');
    assert.dom('[data-test-body] strong').hasText('5');
    assert.dom('[data-test-wa-message-original]').exists();
    assert.dom('[data-test-wa-message-original]').containsText('Original');
    assert.dom('[data-test-wa-message-original-text]').hasText('Viewing at 4');
  });

  test('an unedited message shows only its text', async function (assert) {
    this.set('message', { body: 'Hello', originalBody: null, fromMe: true });
    await render(
      hbs`<Whatsapp::MessageBody @message={{this.message}} data-test-body />`,
    );

    assert.dom('[data-test-body]').hasText('Hello');
    assert.dom('[data-test-wa-message-original]').doesNotExist();
  });

  test('an original equal to the current text is not shown', async function (assert) {
    this.set('message', {
      body: 'Same',
      originalBody: 'Same',
      editedAt: 1700000100,
      fromMe: false,
    });
    await render(
      hbs`<Whatsapp::MessageBody @message={{this.message}} data-test-body />`,
    );

    assert.dom('[data-test-wa-message-original]').doesNotExist();
  });
});
