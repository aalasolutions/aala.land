const FALLBACKS = {
  '--primary': '#1ab5a5',
  '--danger': '#dc2626',
  '--text-muted': '#64748b',
  '--border-base': '#e2e8f0',
};

// Tokens are defined on :root and inherit, so the root is as good a source as
// the canvas, which belongs to ChartCanvas rather than to the chart above it.
export function token(name) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || FALLBACKS[name] || '#000000';
}

// Accepts the hex and rgb() forms a CSS custom property can hold.
export function withAlpha(color, alpha) {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((part) => parseFloat(part));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
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
  } catch {
    return (value) =>
      `${currency ?? ''} ${value.toLocaleString(locale)}`.trim();
  }
}

export function compactFormatter(locale) {
  const format = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return (value) => format.format(value);
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
