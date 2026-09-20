import Controller from '@ember/controller';

const TITLE_SIZE_NOTES = {
  xs: 'Eyebrow labels above a value.',
  sm: 'Card and panel titles.',
  md: 'Section headings inside a page.',
  lg: 'Page sub-headings.',
  xl: 'Page titles in a detail view.',
  '2xl': 'Dashboard and landing headings.',
  '3xl': 'A hero heading.',
};

const TEXT_SIZE_NOTES = {
  xs: 'Meta lines and timestamps.',
  sm: 'Table cells, hints and secondary copy.',
  md: 'Body text; the default.',
  lg: 'Lead paragraphs.',
  xl: 'A standout statement.',
};

const WEIGHT_NOTES = {
  normal: 'Body weight.',
  medium: 'A little emphasis for labels.',
  semibold: 'Headings inside body text.',
  bold: 'Strong emphasis, sparingly.',
};

const VARIANT_NOTES = {
  primary: 'Brand-coloured text for links and highlights.',
  secondary: 'A second accent.',
  success: 'A positive figure or status.',
  warning: 'A figure to watch.',
  danger: 'An error or an overdue figure.',
  info: 'Informational text.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoTypographyController extends Controller {
  titleSizeExamples = Object.keys(TITLE_SIZE_NOTES).map((size) => ({
    size,
    title: `size ${size}`,
    note: TITLE_SIZE_NOTES[size],
    code: `<Nuvo::Title @tag="h3" @size="${size}" @text="Title ${size}" />`,
  }));

  textSizeExamples = Object.keys(TEXT_SIZE_NOTES).map((size) => ({
    size,
    title: `size ${size}`,
    note: TEXT_SIZE_NOTES[size],
    code: `<Nuvo::Text @size="${size}" @text="Text ${size}" />`,
  }));

  weightExamples = Object.keys(WEIGHT_NOTES).map((weight) => ({
    weight,
    title: capitalize(weight),
    note: WEIGHT_NOTES[weight],
    code: `<Nuvo::Text @weight="${weight}" @text="${capitalize(weight)} text" />`,
  }));

  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code: `<Nuvo::Text @variant="${variant}" @text="${capitalize(variant)} text" />`,
  }));

  code = {
    tag: `<Nuvo::Title @tag="h1" @size="lg" @text="An h1 at the lg size" />
<Nuvo::Title @tag="h4" @size="lg" @text="An h4 at the same size" />`,
    titleWeight: `<Nuvo::Title @size="xl" @weight="semibold" @text="Marina Tower" />`,
    titleTruncate: `<Nuvo::Title @size="md" @tag="h4" @truncate={{true}} @text="A very long unit description that should truncate with an ellipsis when the container is narrow" />`,
    titleBlock: `<Nuvo::Title @size="sm" @tag="h5"><Ui::Ph @icon="buildings" /> Block content</Nuvo::Title>`,
    textTag: `<Nuvo::Text @tag="span" @size="xs" @text="Inline span" />`,
    muted: `<Nuvo::Text @muted={{true}} @text="Last synced 4 minutes ago." />`,
    subtle: `<Nuvo::Text @subtle={{true}} @text="Optional note." />`,
    truncate: `<Nuvo::Text @truncate={{true}} @text="Truncated to one line with an ellipsis when the container is narrower than this sentence." />`,
    clamp2: `<Nuvo::Text @clamp="2" @text="..." />`,
    clamp3: `<Nuvo::Text @clamp="3" @text="..." />`,
  };

  longText =
    'This unit includes a fully equipped kitchen, two parking bays, access to the marina promenade, and a maintenance package covering AC servicing twice a year plus emergency plumbing support around the clock, with a dedicated concierge desk in the lobby.';

  titleArgRows = [
    { name: '@tag', type: '"h1" | "h2" | "h3" | "h4" | "h5" | "h6"', default: '"h2"', description: 'Heading element. Pick the level from the document outline, the size from @size.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"', default: '', description: 'Type size step.' },
    { name: '@weight', type: '"normal" | "medium" | "semibold" | "bold"', default: '', description: 'Font weight.' },
    { name: '@truncate', type: 'boolean', default: 'false', description: 'Single line with an ellipsis.' },
    { name: '@text', type: 'string', default: '', description: 'Content when no block is given.' },
  ];

  textArgRows = [
    { name: '@tag', type: '"p" | "span"', default: '"p"', description: 'Block paragraph or inline span.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg" | "xl"', default: '', description: 'Type size step.' },
    { name: '@weight', type: '"normal" | "medium" | "semibold" | "bold"', default: '', description: 'Font weight.' },
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Text colour from the variant scale.' },
    { name: '@muted', type: 'boolean', default: 'false', description: 'Muted text colour.' },
    { name: '@subtle', type: 'boolean', default: 'false', description: 'Subtle (lighter) text colour.' },
    { name: '@truncate', type: 'boolean', default: 'false', description: 'Single line with an ellipsis.' },
    { name: '@clamp', type: '"2" | "3"', default: '', description: 'Clamp to two or three lines.' },
    { name: '@text', type: 'string', default: '', description: 'Content when no block is given.' },
  ];

  blockRows = [
    { name: 'default', description: 'Content. Takes precedence over @text on both components.' },
  ];
}
