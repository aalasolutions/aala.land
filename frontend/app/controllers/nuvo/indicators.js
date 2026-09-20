import Controller from '@ember/controller';

const VARIANT_TYPE =
  '"primary" | "secondary" | "success" | "warning" | "danger" | "info"';

const DOT_NOTES = {
  default: 'Neutral marker for a bullet-like separator or an unknown state.',
  primary: 'The item that is current or selected.',
  secondary: 'A second neutral tone for grouping.',
  success: 'Online, active, healthy.',
  warning: 'Degraded, pending, expiring.',
  danger: 'Offline, failed, overdue.',
  info: 'Informational marker such as a channel or source.',
};

const SPINNER_NOTES = {
  default: 'Inherits the text colour; right inside buttons and on neutral surfaces.',
  primary: 'Brand-coloured, for page and panel loading states.',
  secondary: 'Muted, for background refreshes that should not draw the eye.',
  success: 'A save or sync that is completing.',
  warning: 'A retry or a slow operation the user should notice.',
  danger: 'A destructive operation in flight.',
  info: 'A fetch of informational data.',
};

const SIZE_NOTES = {
  xs: 'Inline with small text and inside xs buttons.',
  sm: 'Table cells, list rows and sm buttons.',
  md: 'The default, for cards and panels.',
  lg: 'Page-level and empty-state loading.',
};

const SHAPE_NOTES = {
  text: 'One line of body text.',
  title: 'A heading-height bar.',
  circle: 'An avatar or icon placeholder.',
  rect: 'A block such as an image or a chart.',
};

const WIDTH_NOTES = {
  25: 'A short value, such as a date or a count.',
  50: 'A name or a title.',
  75: 'A sentence.',
  full: 'A paragraph line or a full-width block.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoIndicatorsController extends Controller {
  dotVariantExamples = Object.keys(DOT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: DOT_NOTES[variant],
    code: variant === 'default' ? '<Nuvo::Dot />' : `<Nuvo::Dot @variant="${variant}" />`,
  }));

  dotSizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code: `<Nuvo::Dot @variant="primary" @size="${size}" />`,
  }));

  spinnerVariantExamples = Object.keys(SPINNER_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: SPINNER_NOTES[variant],
    code: variant === 'default' ? '<Nuvo::Spinner />' : `<Nuvo::Spinner @variant="${variant}" />`,
  }));

  spinnerSizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code: `<Nuvo::Spinner @size="${size}" />`,
  }));

  shapeExamples = Object.keys(SHAPE_NOTES).map((shape) => ({
    shape,
    title: capitalize(shape),
    note: SHAPE_NOTES[shape],
    code: `<Nuvo::Skeleton @shape="${shape}" />`,
  }));

  widthExamples = Object.keys(WIDTH_NOTES).map((width) => ({
    width,
    title: width === 'full' ? 'Full' : `${width}%`,
    note: WIDTH_NOTES[width],
    code: `<Nuvo::Skeleton @shape="text" @width="${width}" />`,
  }));

  code = {
    ring: `<Nuvo::Dot @variant="success" @ring={{true}} />`,
    pulse: `<Nuvo::Dot @variant="danger" @pulse={{true}} />`,
    lines: `<Nuvo::Skeleton @shape="text" @lines={{3}} />`,
    composed: `<div class="nuvo-row">
  <Nuvo::Skeleton @shape="circle" />
  <Nuvo::Skeleton @shape="title" @width="50" />
</div>
<Nuvo::Skeleton @shape="text" @lines={{2}} />`,
  };

  dotArgRows = [
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Fill colour. Omit for the neutral dot.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg"', default: '', description: 'Diameter step.' },
    { name: '@pulse', type: 'boolean', default: 'false', description: 'Animated pulse ring for live activity.' },
    { name: '@ring', type: 'boolean', default: 'false', description: 'Static outer ring.' },
  ];

  spinnerArgRows = [
    { name: '@variant', type: VARIANT_TYPE, default: '', description: 'Stroke colour. Omit for the neutral spinner.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg"', default: '', description: 'Diameter step.' },
  ];

  skeletonArgRows = [
    { name: '@shape', type: '"text" | "title" | "circle" | "rect"', default: '', description: 'Placeholder shape.' },
    { name: '@width', type: '"25" | "50" | "75" | "full"', default: '', description: 'Inline size as a fraction of the container.' },
    { name: '@lines', type: 'number', default: '', description: 'Greater than 1 renders a nu-skeleton-group of text lines instead of one block.' },
  ];
}
