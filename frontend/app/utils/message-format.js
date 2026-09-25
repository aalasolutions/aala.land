import { splitMessageLinks } from 'land/utils/message-links';

const EMPHASIS = { '*': 'bold', _: 'italic', '~': 'strike', '`': 'code' };
const FENCE = '```';
const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

function isWordChar(char) {
  return char !== undefined && WORD_CHAR.test(char);
}

// Links are atomic: a marker inside a URL never formats, and a span never cuts a link in half.
function linkRanges(text) {
  const ranges = [];
  let offset = 0;
  for (const part of splitMessageLinks(text)) {
    if (part.isLink) {
      ranges.push({ start: offset, end: offset + part.value.length, part });
    }
    offset += part.value.length;
  }
  return ranges;
}

function linkAt(links, index) {
  return links.find((link) => index >= link.start && index < link.end);
}

function cutsLink(links, start, end) {
  return links.some(
    (link) =>
      link.start < end &&
      link.end > start &&
      (link.start < start || link.end > end),
  );
}

function pushPlain(nodes, text, start, end, links) {
  let cursor = start;
  for (const link of links) {
    if (link.end <= start || link.start >= end) continue;
    if (link.start > cursor) {
      nodes.push({ type: 'text', value: text.slice(cursor, link.start) });
    }
    const { value, href, host } = link.part;
    nodes.push({ type: 'link', value, href, host });
    cursor = link.end;
  }
  if (end > cursor) {
    nodes.push({ type: 'text', value: text.slice(cursor, end) });
  }
}

function fenceEnd(text, start, end, links) {
  if (!text.startsWith(FENCE, start)) return -1;
  const close = text.indexOf(FENCE, start + FENCE.length + 1);
  if (close < 0 || close + FENCE.length > end) return -1;
  return cutsLink(links, start, close + FENCE.length) ? -1 : close;
}

// WhatsApp's rule: markers hug the text and sit at word edges, so 2*3*4 and snake_case stay plain.
function emphasisEnd(text, start, end, links) {
  const marker = text[start];
  const first = text[start + 1];
  if (isWordChar(text[start - 1])) return -1;
  if (start + 1 >= end || SPACE.test(first) || first === marker) return -1;
  for (let i = start + 2; i < end; i++) {
    const char = text[i];
    if (char === '\n') return -1;
    if (char !== marker || linkAt(links, i)) continue;
    if (SPACE.test(text[i - 1]) || isWordChar(text[i + 1])) continue;
    return cutsLink(links, start, i + 1) ? -1 : i;
  }
  return -1;
}

function parseRange(text, start, end, links) {
  const nodes = [];
  let plainStart = start;
  let i = start;
  while (i < end) {
    const link = linkAt(links, i);
    if (link) {
      i = link.end;
      continue;
    }
    const fence = fenceEnd(text, i, end, links);
    if (fence >= 0) {
      pushPlain(nodes, text, plainStart, i, links);
      nodes.push({ type: 'pre', value: text.slice(i + FENCE.length, fence) });
      i = fence + FENCE.length;
      plainStart = i;
      continue;
    }
    const type = EMPHASIS[text[i]];
    const close = type ? emphasisEnd(text, i, end, links) : -1;
    if (close < 0) {
      i++;
      continue;
    }
    pushPlain(nodes, text, plainStart, i, links);
    nodes.push(
      type === 'code'
        ? { type, value: text.slice(i + 1, close) }
        : { type, children: parseRange(text, i + 1, close, links) },
    );
    i = close + 1;
    plainStart = i;
  }
  pushPlain(nodes, text, plainStart, end, links);
  return nodes;
}

// Parses WhatsApp formatting into a node tree; the text itself is never turned into HTML.
export function parseMessageText(text) {
  if (!text) return [];
  return parseRange(text, 0, text.length, linkRanges(text));
}
