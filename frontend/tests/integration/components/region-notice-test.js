import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | region-notice', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'dubai', name: 'Dubai' },
      { code: 'abu-dhabi', name: 'Abu Dhabi' },
    ];
    region.activeRegion = region.regions[0];
  });

  test('names both regions when the record is elsewhere', async function (assert) {
    await render(hbs`<RegionNotice @regionCode="abu-dhabi" @noun="lease" />`);

    assert
      .dom('[data-test-region-notice]')
      .includesText('This lease is in Abu Dhabi. You are viewing from Dubai.');
  });

  test('stays hidden when the record is in the selected region', async function (assert) {
    await render(hbs`<RegionNotice @regionCode="dubai" @noun="lease" />`);

    assert.dom('[data-test-region-notice]').doesNotExist();
  });
});
