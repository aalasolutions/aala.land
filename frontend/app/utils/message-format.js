import { splitMessageLinks } from 'land/utils/message-links';

const EMPHASIS = { '*': 'bold', _: 'italic', '~': 'strike', '`': 'code' };
const FENCE = '```';
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const SPACE = /\s/;

// Whole code points, so a letter outside the basic plane still counts as a word character.
function charBefore(text, index) {
  const code = text.charCodeAt(index - 1);
  return code >= 0xdc00 && code <= 0xdfff && index >= 2
    ? text.slice(index - 2, index)
    : text[index - 1];
}

function charAfter(text, index) {
  const code = text.codePointAt(index + 1);
  return code === undefined ? undefined : String.fromCodePoint(code);
}

function isWordChar(char) {
  return char !== undefined && WORD_CHAR.test(char);
}

// Links are atomic, so a marker inside a URL never formats; linkIndex maps each character to its link or -1.
function indexLinks(text) {
  const links = [];
  const linkIndex = new Int32Array(text.length).fill(-1);
  let offset = 0;
  for (const part of splitMessageLinks(text)) {
    const end = offset + part.value.length;
    if (part.isLink) {
      linkIndex.fill(links.length, offset, end);
      links.push({ end, part });
    }
    offset = end;
  }
  return { text, links, linkIndex };
}

function linkAt(ctx, index) {
  const at = ctx.linkIndex[index];
  return at >= 0 ? ctx.links[at] : null;
}

function pushPlain(ctx, nodes, start, end) {
  let cursor = start;
  for (let i = start; i < end; i++) {
    const link = linkAt(ctx, i);
    if (!link) continue;
    if (i > cursor) {
      nodes.push({ type: 'text', value: ctx.text.slice(cursor, i) });
    }
    const { value, href, host } = link.part;
    nodes.push({ type: 'link', value, href, host });
    cursor = link.end;
    i = link.end - 1;
  }
  if (end > cursor) {
    nodes.push({ type: 'text', value: ctx.text.slice(cursor, end) });
  }
}

// Fenced-code convention: a single leading/trailing newline is the fence's own line break, not content.
function trimFenceEdges(value) {
  return value.replace(/^\n/, '').replace(/\n$/, '');
}

function fenceEnd(ctx, start, end) {
  if (!ctx.text.startsWith(FENCE, start)) return { close: -1 };
  const close = ctx.text.indexOf(FENCE, start + FENCE.length + 1);
  return close >= 0 && close + FENCE.length <= end
    ? { close }
    : { close: -1, scannedTo: end };
}

// WhatsApp's rule: markers hug the text and sit at word edges, so 2*3*4 and snake_case stay plain.
function emphasisEnd(ctx, start, end) {
  const { text } = ctx;
  const marker = text[start];
  const first = text[start + 1];
  if (isWordChar(charBefore(text, start))) return { close: -1 };
  if (start + 1 >= end || SPACE.test(first) || first === marker) {
    return { close: -1 };
  }
  let i = start + 2;
  for (; i < end; i++) {
    const char = text[i];
    if (char === '\n') break;
    if (char !== marker || linkAt(ctx, i)) continue;
    if (SPACE.test(text[i - 1]) || isWordChar(charAfter(text, i))) continue;
    return { close: i };
  }
  return { close: -1, scannedTo: i };
}

function parseRange(ctx, start, end) {
  const nodes = [];
  // A failed closing search is remembered per marker: any later opener before that point fails the same way.
  const scanned = {};
  let plainStart = start;
  let i = start;
  while (i < end) {
    const link = linkAt(ctx, i);
    if (link) {
      i = link.end;
      continue;
    }
    const fence = scanned[FENCE] > i ? { close: -1 } : fenceEnd(ctx, i, end);
    if (fence.scannedTo !== undefined) scanned[FENCE] = fence.scannedTo;
    if (fence.close >= 0) {
      pushPlain(ctx, nodes, plainStart, i);
      nodes.push({
        type: 'pre',
        value: trimFenceEdges(ctx.text.slice(i + FENCE.length, fence.close)),
      });
      i = fence.close + FENCE.length;
      plainStart = i;
      continue;
    }
    const marker = ctx.text[i];
    const type = EMPHASIS[marker];
    const found =
      type && !(scanned[marker] > i) ? emphasisEnd(ctx, i, end) : { close: -1 };
    if (found.scannedTo !== undefined) scanned[marker] = found.scannedTo;
    if (found.close < 0) {
      i++;
      continue;
    }
    pushPlain(ctx, nodes, plainStart, i);
    nodes.push(
      type === 'code'
        ? { type, value: ctx.text.slice(i + 1, found.close) }
        : { type, children: parseRange(ctx, i + 1, found.close) },
    );
    i = found.close + 1;
    plainStart = i;
  }
  pushPlain(ctx, nodes, plainStart, end);
  return nodes;
}

// Parses WhatsApp formatting into a node tree; the text itself is never turned into HTML.
export function parseMessageText(text) {
  if (!text) return [];
  return parseRange(indexLinks(text), 0, text.length);
}
