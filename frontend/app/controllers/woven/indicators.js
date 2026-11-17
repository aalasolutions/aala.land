import Controller from '@ember/controller';

const DOT_NOTES = {
  default: 'Neutral marker for a bullet-like separator or an unknown state. secondary renders the same.',
  brand: 'The item that is current or selected.',
  success: 'Online, active, healthy. The kit draws a check shape too, so color is not the only signal.',
  warning: 'Degraded, pending, expiring. Drawn as a triangle.',
  danger: 'Offline, failed, overdue. Drawn as an octagon.',
  info: 'Informational marker such as a channel or source.',
};

const SIZE_NOTES = {
  sm: 'Kit sm (1rem). Table cells, list rows and inside buttons. @size="xs" also renders sm.',
  md: 'The default (1.25rem), for cards and panels.',
  lg: 'Kit lg (2rem, thicker band). Page-level and empty-state loading. @size="xl" also renders lg.',
};

const SHAPE_NOTES = {
  text: 'Kit text: one line of body text, 1em high. @shape="title" renders the same.',
  circle: 'Kit circle: an avatar or icon placeholder.',
  block: 'No @shape: the kit default block, 6rem high, for an image or a chart. @shape="rect" renders the same.',
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

export default class WovenIndicatorsController extends Controller {
  dotVariantExamples = Object.keys(DOT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: DOT_NOTES[variant],
    code: variant === 'default' ? '<Woven::Dot />' : `<Woven::Dot @variant="${variant}" />`,
  }));

  spinnerSizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size: size === 'md' ? undefined : size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code: size === 'md' ? '<Woven::Spinner />' : `<Woven::Spinner @size="${size}" />`,
  }));

  shapeExamples = Object.keys(SHAPE_NOTES).map((shape) => ({
    shape: shape === 'block' ? undefined : shape,
    title: capitalize(shape),
    note: SHAPE_NOTES[shape],
    code: shape === 'block' ? '<Woven::Skeleton />' : `<Woven::Skeleton @shape="${shape}" />`,
  }));

  widthExamples = Object.keys(WIDTH_NOTES).map((width) => ({
    width,
    title: width === 'full' ? 'Full' : `${width}%`,
    note: WIDTH_NOTES[width],
    code: `<Woven::Skeleton @shape="text" @width="${width}" />`,
  }));

  code = {
    pulse: `<Woven::Dot @variant="danger" @pulse={{true}} />`,
    color: `<span class="text-brand"><Woven::Spinner /></span>`,
    lines: `<Woven::Skeleton @lines={{3}} />`,
    composed: `<div aria-busy="true">
  <span class="sr-only">Loading</span>
  <div class="woven-row">
    <Woven::Skeleton @shape="circle" />
    <Woven::Skeleton @shape="text" @width="50" />
  </div>
  <Woven::Skeleton @lines={{2}} />
</div>`,
  };

  dotArgRows = [
    { name: '@variant', type: '"brand" | "success" | "warning" | "danger" | "info"', default: '', description: 'Kit role modifier of the same name. secondary and unknown values render the neutral dot.' },
    { name: '@pulse', type: 'boolean', default: 'false', description: 'Kit animated modifier: a fading ring for live status, only when the user allows motion.' },
  ];

  spinnerArgRows = [
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg. Omit for the default size.' },
  ];

  skeletonArgRows = [
    { name: '@shape', type: '"text" | "title" | "circle" | "rect"', default: '', description: 'Kit text or circle; title renders text, rect and no value render the kit default block.' },
    { name: '@width', type: '"25" | "50" | "75" | "full"', default: '', description: 'Sets --wu-skeleton--Width as a percentage. Ignored when @lines is above 1.' },
    { name: '@lines', type: 'number', default: '', description: 'Above 1 renders that many kit text lines in an aria-hidden group; the kit shortens the last line.' },
  ];
}
