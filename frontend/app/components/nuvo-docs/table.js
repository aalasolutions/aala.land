import Component from '@glimmer/component';

// Column presets keyed by @kind; cells flagged `code` render in a nu-code span.
const KINDS = {
  args: [
    { key: 'name', label: 'Name', code: true },
    { key: 'type', label: 'Type' },
    { key: 'default', label: 'Default', code: true },
    { key: 'description', label: 'Description' },
  ],
  callbacks: [
    { key: 'name', label: 'Callback', code: true },
    { key: 'signature', label: 'Arguments', code: true },
    { key: 'description', label: 'Description' },
  ],
  blocks: [
    { key: 'name', label: 'Block', code: true },
    { key: 'description', label: 'Description' },
  ],
  classes: [
    { key: 'name', label: 'Class', code: true },
    { key: 'description', label: 'Description' },
  ],
  attributes: [
    { key: 'name', label: 'Attribute', code: true },
    { key: 'type', label: 'Values' },
    { key: 'default', label: 'Default', code: true },
    { key: 'description', label: 'Description' },
  ],
  api: [
    { key: 'name', label: 'Member', code: true },
    { key: 'signature', label: 'Signature', code: true },
    { key: 'description', label: 'Description' },
  ],
};

// Reference table for arguments, callbacks, blocks, classes and service APIs.
export default class NuvoDocsTableComponent extends Component {
  get columns() {
    return KINDS[this.args.kind] ?? KINDS.args;
  }

  get rows() {
    return (this.args.rows ?? []).map((row) => ({
      cells: this.columns.map((column) => ({
        key: column.key,
        code: Boolean(column.code),
        value: row[column.key],
      })),
    }));
  }
}
