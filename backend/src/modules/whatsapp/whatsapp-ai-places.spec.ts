import {
  PlaceRow,
  buildPlaceIndex,
  buildUnitIndex,
  limitSuggestions,
  namedCountries,
  sectorShaped,
  storedUnitCore,
  unitCore,
  normalizeArabicLetters,
  normalizePlace,
  placeScore,
  resolvePlaceGroup,
  splitLeadingUnit,
  splitTrailingUnit,
  splitUnitFromPlace,
  stripUnitMarker,
  toLatin,
  trigramSimilarity,
} from './whatsapp-ai-places';

const row = (
  assetId: string,
  assetName: string,
  localityName: string,
  cityName: string,
  regionCode: string,
  country: string,
  count = 1,
): PlaceRow => ({
  assetId,
  assetName,
  localityId: `l-${localityName}-${cityName}`,
  localityName,
  cityId: `c-${cityName}`,
  cityName,
  regionCode,
  country,
  type: 'RENTAL',
  count,
});

const ROWS: PlaceRow[] = [
  row('a1', 'Azure Quay Residences', 'Dubai Marina', 'Dubai', 'dubai', 'AE'),
  row('a2', 'Qasr Al Noor Tower', 'Downtown', 'Dubai', 'dubai', 'AE'),
  row('a3', 'Sandstone Court Villas', 'Jumeirah', 'Dubai', 'dubai', 'AE'),
  row('a4', 'Bay Sail Tower', 'Business Bay', 'Dubai', 'dubai', 'AE'),
  row('a5', 'Liberty Crest Apartments', 'Gulberg', 'Lahore', 'punjab', 'PK'),
  row('a6', 'Block J Homes', 'Johar Town', 'Lahore', 'punjab', 'PK'),
  row('a7', 'Gulberg Heights', 'Gulberg', 'Islamabad', 'islamabad', 'PK'),
  row('a8', 'Mueller Row Lofts', 'Mueller', 'Austin', 'texas', 'US', 7),
  row('a9', 'McKinney Avenue Suites', 'Uptown', 'Dallas', 'texas', 'US'),
  row('a10', 'Seaview Crescent', 'Clifton', 'Karachi', 'sindh', 'PK'),
  row('a11', 'Majaz Waterfront', 'Al Majaz', 'Sharjah', 'sharjah', 'AE'),
  row('a12', 'Laurel Court', 'JVC', 'Dubai', 'dubai', 'AE'),
  row('a13', 'Block D Homes', 'DHA Phase 5', 'Lahore', 'punjab', 'PK'),
  row('a14', 'Khayaban Villas', 'DHA Phase 6', 'Karachi', 'sindh', 'PK'),
  row('a15', 'Nahda Park View', 'Al Nahda', 'Sharjah', 'sharjah', 'AE'),
  row('a16', 'Margalla Breeze', 'E-11', 'Islamabad', 'islamabad', 'PK'),
  row('a17', 'Rosewood Homes', 'Bahria Town', 'Lahore', 'punjab', 'PK'),
  row('a18', 'QA Tower', 'QA Locality', 'Austin', 'texas', 'US'),
];

const INDEX = buildPlaceIndex(ROWS);

const resolve = (values: string[], within?: Set<string>) =>
  resolvePlaceGroup(INDEX, values, 'place', within);

const ids = (values: string[]) => [...resolve(values).assetIds].sort();

const only = (value: string) => resolve([value]).terms[0];

describe('normalizePlace and toLatin', () => {
  it('folds Arabic and Urdu letter forms, digits and marks, and parts letters from digits', () => {
    expect(normalizePlace('لاهور')).toBe(normalizePlace('لاہور'));
    expect(normalizePlace('Ḑubai,  Marina!')).toBe('dubai marina');
    expect(normalizePlace('F-٧')).toBe('f 7');
    expect(normalizePlace('Phase8')).toBe('phase 8');
  });

  it('spells Arabic and Urdu script in Latin letters', () => {
    expect(toLatin('لاہور')).toBe('lahwr');
    expect(toLatin('گلبرگ')).toBe('glbrg');
    expect(toLatin('الشارقة')).toBe('sharqa');
  });

  it('folds Arabic letter forms in one direction only', () => {
    expect(normalizeArabicLetters('كيف')).toBe('کیف');
    expect(normalizeArabicLetters('مدينة')).toBe(
      normalizeArabicLetters('مدینہ'),
    );
    expect(normalizeArabicLetters('ـتـ')).toBe('ت');
  });

  it('scores like pg_trgm similarity()', () => {
    expect(trigramSimilarity('clifton', 'clifton')).toBe(1);
    expect(trigramSimilarity('clifon', 'clifton')).toBeCloseTo(0.5);
    expect(trigramSimilarity('dallas', 'dubai')).toBeLessThan(0.3);
  });
});

describe('placeScore', () => {
  it.each([
    ['دبي', 'Dubai'],
    ['لاہور', 'Lahore'],
    ['جميرا', 'Jumeirah'],
    ['Gulbrg', 'Gulberg'],
    ['Austn', 'Austin'],
    ['کراچی', 'Karachi'],
    ['اسلام آباد', 'Islamabad'],
    ['Marina', 'Dubai Marina'],
    ['مارینا', 'Dubai Marina'],
    ['Jumeirah Village Circle', 'JVC'],
    ['الشارقة', 'Sharjah'],
    ['برج قصر النور', 'Qasr Al Noor Tower'],
    ['Clifon', 'Clifton'],
    ['Gulbarg', 'Gulberg'],
    ['Sharja', 'Sharjah'],
    ['Marena', 'Dubai Marina'],
    ['Dubayi', 'Dubai'],
  ])('matches %s to %s', (query, name) => {
    expect(placeScore(query, name)).toBeGreaterThanOrEqual(0.5);
  });

  it('does not match unrelated names', () => {
    expect(placeScore('Karachi', 'Karama')).toBeLessThan(0.5);
    expect(placeScore('Dallas', 'Dubai')).toBeLessThan(0.3);
  });

  it('never lets a different phase, block or sector number match', () => {
    expect(placeScore('DHA Phase 8', 'DHA Phase 5')).toBeLessThan(0.5);
    expect(placeScore('Block E Homes', 'Block J Homes')).toBeLessThan(0.5);
    expect(placeScore('Sector G', 'Sector H')).toBeLessThan(0.5);
    expect(placeScore('Tower 12', 'Tower 2')).toBeLessThan(0.5);
  });

  it.each([
    'D',
    'H',
    '3',
    '5',
    'QA',
    'Town',
    'Tower',
    'Homes',
    'Block',
    'Al',
    'City',
  ])('never matches %s on its own', (query) => {
    for (const name of [
      'Block D Homes',
      'Sector H',
      'DHA Phase 5',
      'QA Tower',
      'Johar Town',
      'Bay Sail Tower',
      'Al Majaz',
      'Khalifa City',
    ]) {
      expect(placeScore(query, name)).toBe(0);
    }
  });
});

describe('resolvePlaceGroup', () => {
  it('searches an Urdu-script city as the stored Latin name', () => {
    expect(ids(['لاہور'])).toEqual(['a13', 'a17', 'a5', 'a6']);
    expect(ids(['لاہور میں'])).toEqual(['a13', 'a17', 'a5', 'a6']);
  });

  it('reads Arabic-script cities and buildings and misspelled Latin names', () => {
    expect(ids(['الشارقة'])).toEqual(['a11', 'a15']);
    expect(ids(['برج قصر النور'])).toEqual(['a2']);
    expect(ids(['Clifon'])).toEqual(['a10']);
    expect(ids(['Gulbarg'])).toEqual(['a5', 'a7']);
    expect(ids(['Sharja'])).toEqual(['a11', 'a15']);
  });

  it('reads airport and city codes as the company cities', () => {
    expect(ids(['DXB'])).toEqual(['a1', 'a12', 'a2', 'a3', 'a4']);
    expect(ids(['KHI'])).toEqual(['a10', 'a14']);
    expect(ids(['DXB Marina'])).toEqual(['a1']);
    expect(only('RUH').status).toBe('unknown');
  });

  it('answers a name with no match by a did-you-mean list of company places, or as unknown', () => {
    const near = only('Mueler Town');
    expect(near.status).toBe('unknown');
    expect(near.suggestions.map((s) => s.name)).toContain('Mueller');
    const none = only('Timbuktu');
    expect(none).toMatchObject({ status: 'unknown', suggestions: [] });
  });

  it('searches a region or country down to its units', () => {
    expect(ids(['Texas'])).toEqual(['a18', 'a8', 'a9']);
    expect(ids(['دبي'])).toEqual(['a1', 'a12', 'a2', 'a3', 'a4']);
    expect(ids(['UAE'])).toEqual(['a1', 'a11', 'a12', 'a15', 'a2', 'a3', 'a4']);
  });

  it('narrows to the area and never widens to its city', () => {
    expect(ids(['Dubai Marina'])).toEqual(['a1']);
    expect(ids(['Dubai Marina, Dubai'])).toEqual(['a1']);
  });

  it.each([
    ['Downtown Dubai', ['a2']],
    ['Dubai Downtown', ['a2']],
    ['Business Bay Dubai', ['a4']],
    ['JVC Dubai', ['a12']],
    ['Gulberg Lahore', ['a5']],
    ['Karachi ka Clifton', ['a10']],
    ['لاہور گلبرگ', ['a5']],
    ['Austin Texas', ['a18', 'a8']],
    ['Dallas Texas', ['a9']],
    ['Lahore Pakistan', ['a13', 'a17', 'a5', 'a6']],
    ['DHA Lahore', ['a13']],
    ['Bahria Town Lahore', ['a17']],
    ['E-11 Islamabad', ['a16']],
    ['Marina Dubai', ['a1']],
    ['Lahore mein', ['a13', 'a17', 'a5', 'a6']],
  ])('reads %s as the narrower place inside the broader one', (value, want) => {
    expect(ids([value])).toEqual(want);
    expect(only(value).status).toBe('matched');
  });

  it('reads full names and their short forms as the same place', () => {
    expect(ids(['Jumeirah Village Circle'])).toEqual(['a12']);
    expect(ids(['BB'])).toEqual(['a4']);
    expect(only('Jumeirah Village Circle').exact).toBe(false);
    expect(only('JVC').exact).toBe(true);
  });

  it('says a numbered place that does not exist is unknown and names its neighbors', () => {
    const phase = only('DHA Phase 8');
    expect(phase.status).toBe('unknown');
    expect(phase.matches).toEqual([]);
    expect(phase.suggestions.map((s) => s.name).sort()).toEqual([
      'DHA Phase 5',
      'DHA Phase 6',
    ]);
    expect(resolve(['DHA Phase 8']).assetIds).toEqual([]);
    const block = only('Block E Homes');
    expect(block.status).toBe('unknown');
    expect(resolve(['Block E Homes']).assetIds).toEqual([]);
  });

  it('keeps suggestions inside the broader place when the narrower one is missing', () => {
    const inLahore = only('DHA Phase 8 Lahore');
    expect(inLahore.status).toBe('unknown');
    expect(inLahore.inside.map((m) => m.name)).toEqual(['Lahore']);
    expect(inLahore.suggestions.map((s) => s.name)).toEqual(['DHA Phase 5']);
    const elsewhere = only('Al Nahda Dubai');
    expect(elsewhere.status).toBe('unknown');
    expect(elsewhere.suggestions).toEqual([
      expect.objectContaining({ name: 'Dubai', level: 'city' }),
    ]);
    const austin = only('Downtown Austin');
    expect(austin.status).toBe('unknown');
    expect(austin.suggestions.map((s) => s.name)).toEqual(['Austin']);
  });

  it('resolves inside an earlier group and never suggests a place outside it', () => {
    const dubai = new Set(resolvePlaceGroup(INDEX, ['Dubai'], 'city').assetIds);
    expect(
      resolvePlaceGroup(INDEX, ['Downtown Dubai'], 'place', dubai).assetIds,
    ).toEqual(['a2']);
    const gulberg = resolvePlaceGroup(INDEX, ['Gulberg'], 'place', dubai);
    expect(gulberg.assetIds).toEqual([]);
    expect(gulberg.terms[0].suggestions).toEqual([]);
  });

  it('splits one value into at most three parts and counts the rest', () => {
    const r = resolve(['Austin, Dallas, Karachi, Lahore, Sharjah']);
    expect(r.terms.map((t) => t.label)).toEqual([
      'place 1, part 1',
      'place 1, part 2',
      'place 1, part 3',
    ]);
    expect(r.terms[2].skippedParts).toBe(2);
    expect(r.terms[0].skippedParts).toBeUndefined();
  });

  it('matches nothing for letters, numbers and generic words alone', () => {
    for (const value of [
      'D',
      'H',
      'J',
      '3',
      '6',
      'QA',
      'Town',
      'Tower',
      'Homes',
      'Block',
      'Avenue',
      'Al',
      'City',
      'Sea',
    ]) {
      expect(resolve([value]).assetIds).toEqual([]);
      expect(only(value).status).toBe('unknown');
    }
  });

  it('prefers a place with listings over a region without any', () => {
    expect(ids(['Bahria'])).toEqual(['a17']);
    expect(only('Bahria').matches.map((m) => m.level)).toEqual(['area']);
  });

  it('treats several places as any of them', () => {
    expect(ids(['Austin', 'Dallas'])).toEqual(['a18', 'a8', 'a9']);
    expect(ids(['Johar Town, Gulberg'])).toEqual(['a5', 'a6', 'a7']);
    expect(ids(['Austin and Dallas'])).toEqual(['a18', 'a8', 'a9']);
  });

  it('lets a broader place qualify a narrower one', () => {
    expect(ids(['Gulberg', 'Lahore'])).toEqual(['a5']);
  });

  it('labels each term by its position, never by the customer text', () => {
    const r = resolvePlaceGroup(
      INDEX,
      ['Gulberg', 'Austin and Dallas'],
      'city',
    );
    expect(r.terms.map((t) => t.label)).toEqual([
      'city 1',
      'city 2, part 1',
      'city 2, part 2',
    ]);
  });

  it('reports a known place without listings and suggests close names', () => {
    expect(only('Sindh Abad').status).toBe('unknown');
    const elsewhere = resolve(['Ajman']);
    expect(elsewhere.assetIds).toEqual([]);
    expect(elsewhere.terms[0]).toMatchObject({ status: 'unknown' });
    const weak = only('Bahrain');
    expect(weak.status).toBe('unknown');
    expect(weak.suggestions.map((s) => s.name)).toContain('Bahria Town');
  });

  it('bounds the matches it lists', () => {
    const many = buildPlaceIndex(
      Array.from({ length: 9 }, (_, i) =>
        row(
          `m${i}`,
          `Palm Tower ${i}`,
          `Palm Area ${i}`,
          'Dubai',
          'dubai',
          'AE',
        ),
      ),
    );
    const t = resolvePlaceGroup(many, ['Palm'], 'place').terms[0];
    expect(t.matches.length).toBeLessThanOrEqual(4);
    expect(t.matches.length + t.moreMatches).toBe(18);
  });
});

describe('identifiers', () => {
  const MORE = buildPlaceIndex([
    ...ROWS,
    row('a19', 'Block H Garden Homes', 'Model Town', 'Lahore', 'punjab', 'PK'),
    row('a20', 'F-7/3 Margalla Homes', 'F-7', 'Islamabad', 'islamabad', 'PK'),
    row(
      'a21',
      'Echo Park Court',
      'Silver Lake',
      'Los Angeles',
      'california',
      'US',
    ),
  ]);
  const term = (value: string, index = MORE) =>
    resolvePlaceGroup(index, [value], 'place').terms[0];
  const found = (value: string) =>
    [...resolvePlaceGroup(MORE, [value], 'place').assetIds].sort();

  it('reads Roman numerals as numbers', () => {
    expect(normalizePlace('Phase II')).toBe('phase ii');
    expect(placeScore('DHA Phase VI', 'DHA Phase 6')).toBe(1);
    expect(placeScore('Gulberg III', 'Gulberg 3')).toBe(1);
    expect(placeScore('Phase V', 'Phase 5')).toBe(1);
  });

  it.each(['DHA Phase II', 'DHA Phase IV', 'DHA Phase VII', 'Phase 8'])(
    'never matches %s to a different phase',
    (value) => {
      expect(found(value)).toEqual([]);
      expect(term(value).status).toBe('unknown');
    },
  );

  it.each(['Gulberg III', 'Gulberg 3', 'Gulberg-3'])(
    'reads %s as Gulberg with a number no stored name has, and suggests Gulberg',
    (value) => {
      const t = term(value);
      expect(t.status).toBe('unknown');
      expect(t.suggestions.map((s) => s.name)).toContain('Gulberg');
      const lahore = term(`${value} Lahore`);
      expect(lahore.status).toBe('unknown');
      expect(lahore.suggestions.map((s) => `${s.name}|${s.within}`)).toEqual([
        'Gulberg|Lahore',
      ]);
    },
  );

  it.each([
    ['Block J', ['a6']],
    ['Johar Town Block J', ['a6']],
    ['Block J, Johar Town', ['a6']],
    ['Model Town Block H', ['a19']],
    ['Block H', ['a19']],
    ['Sector F-7', ['a20']],
    ['Sector F-7 Islamabad', ['a20']],
    ['F-7/3', ['a20']],
    ['Phase 5', ['a13']],
  ])('matches %s by its identifiers', (value, want) => {
    expect(found(value)).toEqual(want);
  });

  it('suggests the area when its block or sector is not stored', () => {
    const t = term('Johar Town Block K');
    expect(t.status).toBe('unknown');
    expect(t.suggestions.map((s) => s.name)).toEqual(['Johar Town']);
    expect(found('Block K')).toEqual([]);
    expect(found('Model Town Block J')).toEqual([]);
    expect(found('Sector F-8')).toEqual([]);
  });

  it('knows only the countries and regions the company lists in', () => {
    expect(term('Louisiana', INDEX).status).toBe('unknown');
    expect(found('Texas')).toEqual(['a18', 'a8', 'a9']);
  });
});

describe('splitUnitFromPlace', () => {
  it('takes a marked unit number out of a place', () => {
    expect(splitUnitFromPlace('Mueller Row Lofts, unit 202')).toEqual({
      place: 'Mueller Row Lofts',
      unit: '202',
    });
    expect(splitUnitFromPlace('Azure Quay #1204')).toEqual({
      place: 'Azure Quay',
      unit: '1204',
    });
    expect(splitUnitFromPlace('Dubai Marina')).toEqual({
      place: 'Dubai Marina',
    });
  });

  it('keeps a number that is part of the name unless that unit was also sent', () => {
    expect(splitUnitFromPlace('Marina House 5')).toEqual({
      place: 'Marina House 5',
    });
    expect(splitUnitFromPlace('DHA Phase 6 no 5')).toEqual({
      place: 'DHA Phase 6 no 5',
    });
    expect(splitUnitFromPlace('Marina House 5', '5')).toEqual({
      place: 'Marina House',
      unit: '5',
    });
    expect(
      splitUnitFromPlace('Ghaf Grove Villas, Villa 19', 'Villa 19'),
    ).toEqual({
      place: 'Ghaf Grove Villas',
      unit: 'Villa 19',
    });
  });
});

describe('splitLeadingUnit', () => {
  it('reads a unit written before its building', () => {
    expect(splitLeadingUnit('Villa 22 Sandstone Court')).toEqual({
      unit: 'Villa 22',
      place: 'Sandstone Court',
    });
    expect(splitLeadingUnit('2804 Bay Sail')).toEqual({
      unit: '2804',
      place: 'Bay Sail',
    });
    expect(splitLeadingUnit('Sandstone Court Villa 22')).toBeUndefined();
    expect(splitLeadingUnit('villa 22')).toBeUndefined();
    expect(splitLeadingUnit('A-403 Gulshan')).toEqual({
      unit: 'A-403',
      place: 'Gulshan',
    });
  });
});

describe('splitTrailingUnit', () => {
  it('reads a unit written after its building, worded reading first', () => {
    expect(splitTrailingUnit('Bay Sail 1509')).toEqual([
      { unit: 'Sail 1509', place: 'Bay' },
      { unit: '1509', place: 'Bay Sail' },
    ]);
    expect(splitTrailingUnit('Sandstone Court villa 22')).toEqual([
      { unit: 'villa 22', place: 'Sandstone Court' },
      { unit: '22', place: 'Sandstone Court villa' },
    ]);
    expect(splitTrailingUnit('Gulshan A-403')).toEqual([
      { unit: 'A-403', place: 'Gulshan' },
    ]);
  });

  it('reads nothing as a unit without a number after a name', () => {
    expect(splitTrailingUnit('Sandstone Court')).toEqual([]);
    expect(splitTrailingUnit('1509')).toEqual([]);
  });
});

describe('unit numbers', () => {
  it('drops a leading unit marker and keeps the number as written', () => {
    expect(stripUnitMarker('Unit 606')).toBe('606');
    expect(stripUnitMarker('#12')).toBe('12');
    expect(stripUnitMarker('A-403')).toBe('A-403');
    expect(stripUnitMarker('House 17')).toBe('House 17');
  });

  it('reads the number the customer wrote, dropping one word before it in any script', () => {
    expect(unitCore('27')).toBe('27');
    expect(unitCore('House 17')).toBe('17');
    expect(unitCore('فيلا 14')).toBe('14');
    expect(unitCore('A-403')).toBe('a403');
    expect(unitCore('0907')).toBe('907');
    expect(unitCore('Laurel Court 506')).toBe('laurelcourt506');
  });

  it('reads a stored unit number the same way', () => {
    expect(storedUnitCore('House 27')).toBe('27');
    expect(storedUnitCore('TH 08')).toBe('8');
    expect(storedUnitCore('A-403')).toBe('a403');
    expect(storedUnitCore('Suite 110')).toBe('110');
  });

  it('indexes the buildings that hold each number', () => {
    const units = buildUnitIndex([
      { assetId: 'a1', unitNumber: '905' },
      { assetId: 'a2', unitNumber: '905' },
      { assetId: 'a3', unitNumber: 'House 27' },
      { assetId: 'a4', unitNumber: null },
    ]);
    expect([...units.get('905')!]).toEqual(['a1', 'a2']);
    expect([...units.get('27')!]).toEqual(['a3']);
  });

  it('knows the shape of a sector name', () => {
    expect(['E-11', 'F-7/4', 'G 10'].every(sectorShaped)).toBe(true);
    expect(['House 17', '27', 'Laurel Court 506'].some(sectorShaped)).toBe(
      false,
    );
  });
});

describe('suggestions within the countries a search names', () => {
  const index = buildPlaceIndex([
    row('a1', 'Seaview Crescent', 'Clifton', 'Karachi', 'sindh', 'PK'),
    row('a2', 'Al Rigga Plaza', 'Deira', 'Dubai', 'dubai', 'AE'),
  ]);

  it('drops a suggestion in another country, keeping it when nothing names a country', () => {
    const { terms } = resolvePlaceGroup(index, ['Deira', 'Karama'], 'place');
    expect(terms[1].suggestions.map((s) => s.name)).toContain('Karachi');
    const countries = namedCountries(terms);
    expect([...countries]).toEqual(['AE']);
    expect(limitSuggestions(terms, countries)[1].suggestions).toEqual([]);
    const alone = resolvePlaceGroup(index, ['Karama'], 'place').terms;
    expect(namedCountries(alone).size).toBe(0);
    expect(limitSuggestions(alone, new Set())[0].suggestions).not.toEqual([]);
  });
});
