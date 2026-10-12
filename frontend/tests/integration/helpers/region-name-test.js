import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Helper | region-name', function (hooks) {
  setupRenderingTest(hooks);

  test('shows the region name, or the code when unknown', async function (assert) {
    this.owner.lookup('service:region').regions = [
      { code: 'dubai', name: 'Dubai' },
    ];

    await render(hbs`{{region-name "dubai"}}|{{region-name "elsewhere"}}`);

    assert.dom(this.element).hasText('Dubai|elsewhere');
  });
});
