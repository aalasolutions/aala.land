// Local picker matching: substring hits rank first, then trigram overlap so a typo still finds the item.

const FUZZY_THRESHOLD = 0.5;
// fuzzyScore returns above this only when the label contains the term.
const SUBSTRING_SCORE_FLOOR = 1;

export function normalizeForMatch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function trigrams(text) {
  const grams = new Set();
  for (const word of text.split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

export function fuzzyScore(label, term) {
  const needle = normalizeForMatch(term);
  if (!needle) return 0;
  const haystack = normalizeForMatch(label);
  const at = haystack.indexOf(needle);
  if (at >= 0) return 2 - at / (haystack.length + 1);
  const wanted = trigrams(needle);
  const present = trigrams(haystack);
  let hits = 0;
  for (const gram of wanted) {
    if (present.has(gram)) hits += 1;
  }
  return wanted.size ? hits / wanted.size : 0;
}

// Typo matches show only when no label contains the term.
export function fuzzyFilter(options, term, labelKey = 'label') {
  const scored = options
    .map((option) => ({ option, score: fuzzyScore(option[labelKey], term) }))
    .filter((entry) => entry.score >= FUZZY_THRESHOLD);
  const substringHits = scored.filter(
    (entry) => entry.score > SUBSTRING_SCORE_FLOOR,
  );
  return (substringHits.length ? substringHits : scored)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.option);
}
