const FALLBACKS = {
  '--primary': '#1ab5a5',
  '--success': '#059669',
  '--danger': '#dc2626',
  '--text-muted': '#64748b',
  '--border-base': '#e2e8f0',
};

// Tokens inherit from :root, which the chart can read without owning the canvas.
export function token(name) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || FALLBACKS[name] || '#000000';
}

// Accepts the hex, short-hex and rgb()/rgba() forms a CSS custom property can hold.
export function withAlpha(color, alpha) {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  }
  const short = color.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = [...short[1]].map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => parseFloat(part));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  console.warn(`withAlpha: unsupported colour format "${color}"`);
  return color;
}

export function moneyFormatter(locale, currency, fractionDigits = 0) {
  try {
    const format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: fractionDigits,
    });
    return (value) => format.format(value);
  } catch (error) {
    console.error(`moneyFormatter: currency "${currency}" rejected`, error);
    return (value) =>
      `${currency ?? ''} ${(Number(value) || 0).toLocaleString(locale)}`.trim();
  }
}

export function compactFormatter(locale) {
  try {
    const format = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return (value) => format.format(value);
  } catch (error) {
    console.error(`compactFormatter: locale "${locale}" rejected`, error);
    return (value) => String(Number(value) || 0);
  }
}

// Title-cases an enum such as BANK_TRANSFER for display.
export function humanize(value) {
  return String(value ?? '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
