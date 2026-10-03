import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import { stubAuth } from 'land/tests/helpers/stub-auth';

const ROWS = [
  { name: 'Example Holdings', regionCode: 'makkah', count: 4 },
  { name: 'Example Holdings', regionCode: 'punjab', count: 2 },
];

module('Integration | Component | contact/companies', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.setupRouter();
    this.owner.register(
      'service:region',
      class extends Service {
        regionCode = 'makkah';
        regions = [
          { code: 'makkah', name: 'Makkah' },
          { code: 'punjab', name: 'Punjab' },
        ];
      },
    );
    this.calls = stubAuth(this.owner, {
      role: 'manager',
      respond: () => ({
        data: { data: ROWS, total: ROWS.length, page: 1, limit: 20 },
      }),
    });
  });

  test('each row shows the company with its region name and count', async function (assert) {
    await render(hbs`<Contact::Companies @allRegions={{false}} />`);

    assert.notOk(this.calls[0].path.includes('allRegions'));
    const regions = [
      ...this.element.querySelectorAll('[data-test-contact-company-region]'),
    ].map((el) => el.textContent.trim());
    assert.deepEqual(regions, ['Makkah', 'Punjab']);
  });

  test('a company link opens the exact name in that row region', async function (assert) {
    await render(hbs`<Contact::Companies @allRegions={{false}} />`);

    const href = this.element
      .querySelectorAll('[data-test-contact-company]')[1]
      .getAttribute('href');
    const query = new URLSearchParams(href.split('?')[1]);
    assert.strictEqual(query.get('company'), 'Example Holdings');
    assert.strictEqual(query.get('companyExact'), 'true');
    assert.strictEqual(query.get('region'), 'punjab');
    assert.strictEqual(query.get('allRegions'), 'false');
  });

  test('all regions asks the server for every region the caller holds', async function (assert) {
    await render(hbs`<Contact::Companies @allRegions={{true}} />`);

    assert.ok(this.calls[0].path.includes('allRegions=true'));
  });
});
