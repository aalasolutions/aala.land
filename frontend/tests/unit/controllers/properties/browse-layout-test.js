import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const KEY = 'properties-browse-layout';

module('Unit | Controller | properties browse layout', function (hooks) {
  setupTest(hooks);

  function prepare(ctx, saved = {}) {
    const controller = ctx.owner.lookup('controller:properties/index');
    const store = { ...saved };
    controller.preferences = {
      get: (key, fallback) => store[key] ?? fallback,
      set: (key, value) => {
        store[key] = value;
      },
    };
    return { controller, store };
  }

  test('opens in grid when nothing is saved', function (assert) {
    const { controller } = prepare(this);
    assert.strictEqual(controller.browseLayout, 'grid');
  });

  test('opens in the saved layout', function (assert) {
    const { controller } = prepare(this, { [KEY]: 'list' });
    assert.strictEqual(controller.browseLayout, 'list');
  });

  test('switching layout is remembered', function (assert) {
    const { controller, store } = prepare(this);
    controller.setBrowseLayout('list');
    assert.strictEqual(controller.browseLayout, 'list');
    assert.strictEqual(store[KEY], 'list');
  });
});
