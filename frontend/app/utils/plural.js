export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}
