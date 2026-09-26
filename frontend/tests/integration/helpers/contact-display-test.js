import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// Templates reach the contact-display util only through these helpers.
module('Integration | Helper | contact display', function (hooks) {
  setupRenderingTest(hooks);

  test('a limited contact renders masked values and no WhatsApp', async function (assert) {
    this.contact = {
      accessLevel: 'LIMITED',
      firstName: 'Omar',
      lastInitial: 'H.',
      phoneMasked: '+971 50 *** **67',
    };
    await render(hbs`
      <span id="name">{{contact-name this.contact}}</span>
      <span id="phone">{{contact-phone this.contact}}</span>
      <span id="email">{{contact-email this.contact}}</span>
      <span id="limited">{{if (is-limited-contact this.contact) "yes" "no"}}</span>
      <span id="wa">{{if (can-whatsapp this.contact) "yes" "no"}}</span>
    `);

    assert.dom('#name').hasText('Omar H.');
    assert.dom('#phone').hasText('+971 50 *** **67');
    assert.dom('#email').hasText('');
    assert.dom('#limited').hasText('yes');
    assert.dom('#wa').hasText('no');
  });

  test('a full contact renders its own values', async function (assert) {
    this.contact = {
      accessLevel: 'FULL',
      displayName: 'Sara Khan',
      phone: '+971501112233',
      email: 'sara@example.com',
      isWhatsapp: true,
    };
    await render(hbs`
      <span id="name">{{contact-name this.contact}}</span>
      <span id="phone">{{contact-phone this.contact}}</span>
      <span id="email">{{contact-email this.contact}}</span>
      <span id="limited">{{if (is-limited-contact this.contact) "yes" "no"}}</span>
      <span id="wa">{{if (can-whatsapp this.contact) "yes" "no"}}</span>
    `);

    assert.dom('#name').hasText('Sara Khan');
    assert.dom('#phone').hasText('+971501112233');
    assert.dom('#email').hasText('sara@example.com');
    assert.dom('#limited').hasText('no');
    assert.dom('#wa').hasText('yes');
  });

  test('the access notifications get their own icons', async function (assert) {
    await render(hbs`
      <span id="asked">{{get-notification-icon "CONTACT_ACCESS_REQUESTED"}}</span>
      <span id="decided">{{get-notification-icon "CONTACT_ACCESS_DECIDED"}}</span>
    `);

    assert.dom('#asked').hasText('key');
    assert.dom('#decided').hasText('lock-key-open');
  });
});
