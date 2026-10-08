import { module, test } from 'qunit';
import { fuzzyFilter, fuzzyScore } from 'land/utils/fuzzy-match';

module('Unit | Utility | fuzzy-match', function () {
  const options = [
    { label: 'Bay Tower' },
    { label: 'Al Hafiz Shopping Mall' },
    { label: 'Hafeez Centre' },
  ];

  test('a substring match ranks first', function (assert) {
    assert.deepEqual(
      fuzzyFilter(options, 'haf').map((o) => o.label),
      ['Hafeez Centre', 'Al Hafiz Shopping Mall'],
    );
  });

  test('a typo still finds the item', function (assert) {
    const found = fuzzyFilter(options, 'hafz').map((o) => o.label);
    assert.ok(found.includes('Al Hafiz Shopping Mall'));
    assert.notOk(found.includes('Bay Tower'));
  });

  test('case, accents and punctuation are ignored', function (assert) {
    assert.ok(fuzzyScore('Al-Háfiz Mall', 'al hafiz') >= 1);
  });

  test('a label containing the term hides near misses', function (assert) {
    const units = [
      { label: 'Property: Bay Tower · Unit: U-101' },
      { label: 'Property: Bay Tower · Unit: U-102' },
    ];
    assert.deepEqual(
      fuzzyFilter(units, 'U-101').map((o) => o.label),
      ['Property: Bay Tower · Unit: U-101'],
    );
  });

  test('an unrelated term matches nothing', function (assert) {
    assert.deepEqual(fuzzyFilter(options, 'xyz'), []);
  });
});
