import { module, test } from 'qunit';
import { fetchUnitSummary } from 'land/utils/unit-summary';

function authReturning(response) {
  const paths = [];
  return {
    paths,
    async fetchJson(path) {
      paths.push(path);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

module('Unit | Utility | unit-summary', function () {
  test('no unit id means no read', async function (assert) {
    const auth = authReturning(null);
    assert.strictEqual(await fetchUnitSummary(auth, null), null);
    assert.deepEqual(auth.paths, []);
  });

  test('the area id falls back to the loaded locality', async function (assert) {
    const auth = authReturning({
      data: {
        id: 'unit-1',
        unitNumber: '101',
        asset: { name: 'Bay Tower', locality: { id: 'area-1' } },
      },
    });

    assert.deepEqual(await fetchUnitSummary(auth, 'unit-1'), {
      id: 'unit-1',
      areaId: 'area-1',
      label: 'Bay Tower - 101',
    });
    assert.deepEqual(auth.paths, ['/properties/units/unit-1']);
  });

  test('a unit without an asset keeps its number and no area', async function (assert) {
    const auth = authReturning({ data: { id: 'unit-1', unitNumber: '101' } });

    assert.deepEqual(await fetchUnitSummary(auth, 'unit-1'), {
      id: 'unit-1',
      areaId: null,
      label: '101',
    });
  });

  test('a failed read resolves to null', async function (assert) {
    const auth = authReturning(new Error('Not found'));
    assert.strictEqual(await fetchUnitSummary(auth, 'unit-1'), null);
  });
});
