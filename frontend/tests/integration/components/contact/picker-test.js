import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click, fillIn, findAll } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// The picker is the single person-attachment control: unit owner and lead
// capture both depend on it, so its two modes are pinned here.
module('Integration | Component | contact/picker', function (hooks) {
  setupRenderingTest(hooks);

  const CONTACT = {
    id: 'contact-1',
    displayName: 'Ahmed Al-Rashid',
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    phone: '+971501234567',
    email: 'ahmed@example.com',
    isWhatsapp: true,
    notes: 'Prefers Arabic',
  };

  test('offers search and an add path, and hides the detail fields until one is chosen', async function (assert) {
    await render(hbs`<Contact::Picker @label="Owner" />`);

    assert.dom('[data-test-contact-search]').exists('searches contacts');
    assert.dom('[data-test-contact-add-new]').exists('offers the add path');
    assert
      .dom('[data-test-contact-first-name]')
      .doesNotExist('no detail fields before a choice is made');
    assert.dom().containsText('Owner', '@label names the role');
  });

  test('the add path reveals editable detail fields', async function (assert) {
    await render(hbs`<Contact::Picker />`);
    await click('[data-test-contact-add-new]');

    assert.dom('[data-test-contact-first-name]').hasNoAttribute('readonly');
    assert.dom('[data-test-contact-last-name]').hasNoAttribute('readonly');
    assert.dom('[data-test-contact-phone]').hasNoAttribute('readonly');
    assert.dom('[data-test-contact-email]').hasNoAttribute('readonly');
    assert
      .dom('[data-test-contact-whatsapp]')
      .exists('WhatsApp is a flag on the number, not a second field');
    assert
      .dom('[data-test-contact-add-new]')
      .doesNotExist('the add path is spent once taken');
  });

  test('an attached contact prefills and locks every field', async function (assert) {
    this.contact = CONTACT;
    await render(hbs`<Contact::Picker @contact={{this.contact}} />`);

    assert.dom('[data-test-contact-first-name]').hasValue('Ahmed');
    assert.dom('[data-test-contact-last-name]').hasValue('Al-Rashid');
    assert.dom('[data-test-contact-phone]').hasValue('+971501234567');
    assert.dom('[data-test-contact-email]').hasValue('ahmed@example.com');
    assert.dom('[data-test-contact-first-name]').hasAttribute('readonly');
    assert.dom('[data-test-contact-phone]').hasAttribute('readonly');
    assert
      .dom('[data-test-contact-whatsapp-note]')
      .exists(
        'an attached contact shows the flag, it does not offer to set it',
      );
    assert.dom('[data-test-contact-whatsapp]').doesNotExist();
    assert.dom('[data-test-contact-notes]').hasText('Prefers Arabic');
    assert
      .dom('[data-test-contact-add-new]')
      .doesNotExist('nothing to add once someone is attached');
  });

  test('a contact with no notes shows no notes field', async function (assert) {
    this.contact = { ...CONTACT, notes: null };
    await render(hbs`<Contact::Picker @contact={{this.contact}} />`);

    assert.dom('[data-test-contact-notes]').doesNotExist();
  });

  test('typed details are reported to the parent as field and value', async function (assert) {
    this.changes = [];
    this.onIdentityChange = (field, value) => this.changes.push([field, value]);

    await render(
      hbs`<Contact::Picker @onIdentityChange={{this.onIdentityChange}} />`,
    );
    await click('[data-test-contact-add-new]');
    await fillIn('[data-test-contact-last-name]', 'Al-Rashid Holdings');
    await click('[data-test-contact-whatsapp] input');

    assert.deepEqual(this.changes, [
      ['lastName', 'Al-Rashid Holdings'],
      ['isWhatsapp', true],
    ]);
  });

  test('taking the add path clears any attached contact first', async function (assert) {
    this.cleared = 0;
    this.onClear = () => this.cleared++;

    await render(hbs`<Contact::Picker @onClear={{this.onClear}} />`);
    await click('[data-test-contact-add-new]');

    assert.strictEqual(this.cleared, 1);
  });

  test('field ids interpolate and stay unique across two pickers on one page', async function (assert) {
    await render(hbs`
      <Contact::Picker @contact={{hash id="a" firstName="A"}} />
      <Contact::Picker @contact={{hash id="b" firstName="B"}} />
    `);

    const ids = findAll('[data-test-contact-first-name]').map((el) => el.id);

    assert.strictEqual(ids.length, 2);
    ids.forEach((id) => {
      assert.ok(
        id.endsWith('-first-name'),
        `id "${id}" is built from the component guid`,
      );
      assert.notOk(
        id.includes('{{'),
        `id "${id}" is interpolated, not literal`,
      );
    });
    assert.notStrictEqual(ids[0], ids[1], 'two pickers never share a field id');
  });

  test('a contact without a serialized displayName still labels the field', async function (assert) {
    this.contact = { id: 'c2', firstName: 'Zainab', lastName: 'Qureshi' };
    await render(hbs`<Contact::Picker @contact={{this.contact}} />`);

    assert.dom('[data-test-contact-first-name]').hasValue('Zainab');
  });
});
