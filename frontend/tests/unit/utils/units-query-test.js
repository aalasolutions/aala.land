import { module, test } from 'qunit';
import { unitsListFilters } from 'land/utils/units-query';

module('Unit | Utility | units-query', function () {
  test('maps the browse filters onto the units list query', function (assert) {
    assert.deepEqual(
      unitsListFilters(
        {
          archivedFilterValue: 'include',
          filterType: 'RENTAL',
          filterStatus: 'rented',
          filterBeds: '2',
          filterMinPrice: '1000',
          filterMaxPrice: '5000',
          filterAmenities: ['gym', 'covered_parking'],
        },
        { regionCode: 'makkah' },
      ),
      {
        regionCode: 'makkah',
        archived: 'include',
        propertyType: 'RENTAL',
        status: 'rented',
        minPrice: '1000',
        maxPrice: '5000',
        minBeds: '2',
        maxBeds: '2',
        amenities: 'gym,covered_parking',
      },
    );
  });

  test('the defaults send nothing and 4+ bedrooms opens the upper bound', function (assert) {
    assert.deepEqual(unitsListFilters({}), {});
    assert.deepEqual(unitsListFilters({ filterBeds: '4' }), {
      minBeds: '4',
      maxBeds: '99',
    });
    assert.deepEqual(
      unitsListFilters(
        { archivedFilterValue: 'exclude' },
        { regionCode: null },
      ),
      {},
    );
  });
});
