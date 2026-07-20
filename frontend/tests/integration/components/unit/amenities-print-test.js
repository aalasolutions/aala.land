import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | unit/amenities-print', function (hooks) {
  setupRenderingTest(hooks);

  test('renders a tag per amenity with a humanized label', async function (assert) {
    await render(
      hbs`<Unit::AmenitiesPrint @amenities={{array "private_dock" "rooftop_garden"}} />`,
    );

    assert.dom('.amenity-tag').exists({ count: 2 });
    assert.dom().containsText('Private Dock');
    assert.dom().containsText('Rooftop Garden');
  });

  test('renders no tags when no amenities are provided', async function (assert) {
    await render(hbs`<Unit::AmenitiesPrint />`);

    assert.dom('.amenity-tag').doesNotExist();
  });
});
