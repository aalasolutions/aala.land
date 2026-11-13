import Controller from '@ember/controller';

const SIZE_NOTES = {
  sm: 'Kit sm. Table cells, list rows and activity feeds. @size="xs" also renders sm.',
  md: 'The default for cards and headers.',
  lg: 'Kit lg. Profile panels and detail headers. @size="xl" also renders lg.',
};

const STATUS_NOTES = {
  success: 'Renders data-status="online": a solid dot. Online or available.',
  warning: 'Renders data-status="away": a half-filled dot. Away or idle.',
  danger: 'Renders data-status="busy": a filled dot with a bar. Busy, do not disturb.',
  secondary: 'Renders data-status="offline": a hollow ring. brand and info render the same.',
};

export default class WovenAvatarController extends Controller {
  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size: size === 'md' ? undefined : size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code:
      size === 'md'
        ? '<Woven::Avatar @initials="MD" />'
        : `<Woven::Avatar @initials="${size.toUpperCase()}" @size="${size}" />`,
  }));

  statusExamples = Object.keys(STATUS_NOTES).map((status) => ({
    status,
    title: status.charAt(0).toUpperCase() + status.slice(1),
    note: STATUS_NOTES[status],
    code: `<Woven::Avatar @initials="AM" @status="${status}" />`,
  }));

  code = {
    image: `<Woven::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />`,
    initials: `<Woven::Avatar @initials="AM" />`,
    icon: `<Woven::Avatar @icon="👤" />`,
    square: `<Woven::Avatar @initials="SQ" @square={{true}} />`,
    group: `<Woven::AvatarGroup>
  <Woven::Avatar @initials="AM" />
  <Woven::Avatar @initials="SQ" />
  <Woven::Avatar @initials="ON" />
  <Woven::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />
</Woven::AvatarGroup>`,
    groupOverflow: `<Woven::AvatarGroup role="group" aria-label="Assignees">
  <Woven::Avatar @initials="AM" @size="sm" />
  <Woven::Avatar @initials="SQ" @size="sm" />
  <Woven::Avatar @initials="+3" @size="sm" />
</Woven::AvatarGroup>`,
  };

  argRows = [
    { name: '@src', type: 'string', default: '', description: 'Image URL. When set, initials and icon are ignored.' },
    { name: '@alt', type: 'string', default: '', description: 'Alt text for the image.' },
    { name: '@initials', type: 'string', default: '', description: 'Text fallback when there is no image.' },
    { name: '@icon', type: 'string', default: '', description: 'Glyph fallback when there is neither image nor initials.' },
    { name: '@size', type: '"xs" | "sm" | "lg" | "xl"', default: '', description: 'Kit sm or lg; xs renders sm and xl renders lg. Omit for the default (medium).' },
    { name: '@square', type: 'boolean', default: 'false', description: 'Kit tile modifier: rounded square instead of a circle.' },
    { name: '@status', type: '"success" | "warning" | "danger" | "secondary" | "brand" | "info"', default: '', description: 'Kit data-status dot: success online, warning away, danger busy; secondary, brand and info offline.' },
  ];
}
