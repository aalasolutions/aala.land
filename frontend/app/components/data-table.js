import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { cancelTask, runTask } from 'ember-lifeline';

const SELECT_KEY = '__select__';

const SELECT_COLUMN = {
  name: '',
  valuePath: SELECT_KEY,
  width: 48,
  minWidth: 48,
  isFixed: 'left',
  isResizable: false,
  isSortable: false,
};

const MIRRORED_FIX = { left: 'right', right: 'left' };

const EDITORS = ['text', 'number', 'select', 'search'];
const ROW_CONTROLS =
  'input, button, label, a, select, textarea, .data-table__editor';

export default class DataTableComponent extends Component {
  @service preferences;
  @service layer;

  // ember-table math is LTR only; RTL mirrors columns instead.
  isRtl = (this.args.dir ?? document.documentElement.dir) === 'rtl';

  // One stable copy per column: ember-table writes widths onto it.
  copies = new Map();

  @tracked order = [];
  @tracked hidden = [];
  @tracked layoutVersion = 0;
  @tracked sorts = [];

  constructor() {
    super(...arguments);
    this.buildColumns();
    this.restoreLayout();
  }

  get isSelectable() {
    return Boolean(this.args.onSelect);
  }

  get defs() {
    return this.isSelectable
      ? [SELECT_COLUMN, ...(this.args.columns ?? [])]
      : [...(this.args.columns ?? [])];
  }

  buildColumns() {
    this.copies = new Map();
    for (const def of this.defs) {
      const copy = { ...def };
      if (!this.args.pinColumns) delete copy.isFixed;
      if (copy.isFixed) {
        copy.isReorderable = false;
        if (this.isRtl) copy.isFixed = MIRRORED_FIX[copy.isFixed];
      }
      this.copies.set(copy.valuePath, copy);
    }
    this.order = this.defs.map((def) => def.valuePath);
    this.hidden = [];
  }

  // Cached: reorder mutates this array in place.
  @cached
  get columns() {
    this.layoutVersion;
    const visible = this.order
      .filter((key) => !this.hidden.includes(key))
      .map((key) => this.copies.get(key));
    return this.isRtl ? visible.reverse() : visible;
  }

  // Pinned columns always stay visible.
  @cached
  get optionColumns() {
    return this.order
      .map((key) => this.copies.get(key))
      .filter((column) => !column.isFixed)
      .map((column) => ({
        key: column.valuePath,
        name: column.name,
        visible: !this.hidden.includes(column.valuePath),
      }));
  }

  @action toggleColumn(key) {
    this.hidden = this.hidden.includes(key)
      ? this.hidden.filter((item) => item !== key)
      : [...this.hidden, key];
    this.saveLayout();
  }

  // Read the in-place reorder back, keeping hidden columns in their slots.
  @action handleReorder() {
    const shown = this.columns.map((column) => column.valuePath);
    const logical = this.isRtl ? [...shown].reverse() : shown;
    let next = 0;
    this.order = this.order.map((key) =>
      this.hidden.includes(key) ? key : logical[next++],
    );
    this.saveLayout();
  }

  // ember-table cycles none, desc, asc; convention is none, asc, desc.
  // Client-side sort by default; `@onSort` lets a page sort on the server.
  @action updateSorts(incoming) {
    const previous = this.sorts;
    const changed = (sort) =>
      !previous.some(
        (p) => p.valuePath === sort.valuePath && p.isAscending === sort.isAscending,
      );
    const dropped = (sort) =>
      !incoming.some((s) => s.valuePath === sort.valuePath);
    const clicked = incoming.find(changed) ?? previous.find(dropped);
    if (!clicked) return;

    const was = previous.find((p) => p.valuePath === clicked.valuePath);
    const others = incoming.filter((s) => s.valuePath !== clicked.valuePath);
    const next = !was
      ? { valuePath: clicked.valuePath, isAscending: true }
      : was.isAscending
        ? { valuePath: clicked.valuePath, isAscending: false }
        : null;

    this.sorts = next ? [...others, next] : others;
    this.args.onSort?.(this.sorts);
  }

  @action handleResize() {
    this.saveLayout();
  }

  @action resetLayout() {
    if (this.args.tableId) this.preferences.remove(this.layoutKey);
    this.buildColumns();
    // New copies; force the cached columns to rebuild.
    this.layoutVersion++;
  }

  // Per user (preferences keys by user id).
  get layoutKey() {
    return `table-${this.args.tableId}`;
  }

  saveLayout() {
    if (!this.args.tableId) return;
    const widths = {};
    for (const [key, column] of this.copies) {
      if (key !== SELECT_KEY && typeof column.width === 'number') {
        widths[key] = column.width;
      }
    }
    this.preferences.set(this.layoutKey, {
      order: this.order,
      hidden: this.hidden,
      widths,
    });
  }

  // Drop unknown keys, append new columns.
  restoreLayout() {
    if (!this.args.tableId) return;
    const saved = this.preferences.get(this.layoutKey);
    if (!saved) return;

    const known = new Set(this.copies.keys());
    const order = (saved.order ?? []).filter((key) => known.has(key));
    for (const key of known) if (!order.includes(key)) order.push(key);
    this.order = order;

    this.hidden = (saved.hidden ?? []).filter(
      (key) => known.has(key) && !this.copies.get(key).isFixed,
    );

    for (const [key, width] of Object.entries(saved.widths ?? {})) {
      const column = this.copies.get(key);
      if (column && typeof width === 'number') column.width = width;
    }
  }

  get selection() {
    return this.args.selection ?? [];
  }

  get rows() {
    return this.args.rows ?? [];
  }

  get selectedOnPage() {
    return this.rows.filter((row) => this.isRowSelected(row)).length;
  }

  get allSelected() {
    return this.rows.length > 0 && this.selectedOnPage === this.rows.length;
  }

  get someSelected() {
    return this.selectedOnPage > 0 && !this.allSelected;
  }

  // Match by id; reloads create new objects.
  isRowSelected = (row) => this.selection.some((item) => item?.id === row?.id);

  @action toggleRow(row) {
    const next = this.isRowSelected(row)
      ? this.selection.filter((item) => item?.id !== row?.id)
      : [...this.selection, row];
    this.args.onSelect(next);
  }

  @action toggleAll() {
    const pageIds = new Set(this.rows.map((row) => row.id));
    const others = this.selection.filter((item) => !pageIds.has(item?.id));
    this.args.onSelect(this.allSelected ? others : [...others, ...this.rows]);
  }

  // Row click selection is off on editable tables: single and double click must not compete.
  get rowClickSelects() {
    return Boolean(
      this.args.selectOnRowClick && this.isSelectable && !this.isEditable,
    );
  }

  // `@onRowClick(row, event)` opens or navigates; selection wins when both are set.
  get hasRowClick() {
    return this.rowClickSelects || Boolean(this.args.onRowClick);
  }

  // Rows with a `children` array nest (ember-table tree); parents collapse.
  get isTree() {
    return Boolean(this.args.tree);
  }

  // Controls inside a row never toggle it.
  @action handleRowClick({ event, rowValue }) {
    if (!this.hasRowClick) return;
    if (event.target.closest(ROW_CONTROLS)) {
      return;
    }
    if (this.rowClickSelects) {
      this.toggleRow(rowValue);
      return;
    }
    this.args.onRowClick(rowValue, event);
  }

  // ---- cell editing: double-click opens, Enter/Tab/blur commit, Escape cancels ----

  @tracked editing = null;
  @tracked draft = '';

  get isEditable() {
    return Boolean(this.args.onCellEdit);
  }

  editorFor = (column) =>
    this.isEditable && EDITORS.includes(column?.editable)
      ? column.editable
      : null;

  isEditing = (row, column) =>
    Boolean(this.editing) &&
    this.editing.row?.id === row?.id &&
    this.editing.key === column?.valuePath;

  // Current display name for a search editor, whether the cell holds an object or a string.
  get searchLabel() {
    if (!this.editing) return '';
    const { row, key, column } = this.editing;
    const value = row?.[key];
    if (value && typeof value === 'object') {
      return String(value[column.labelKey ?? 'name'] ?? '');
    }
    return value == null ? '' : String(value);
  }

  @action startEdit(row, column) {
    if (!this.editorFor(column)) return;
    const value = row?.[column.valuePath];
    this.draft = value == null ? '' : String(value);
    this.editing = { row, key: column.valuePath, column };
  }

  @action setDraft(value) {
    this.draft = value ?? '';
  }

  @action cancelEdit() {
    this.editing = null;
  }

  // Text and number editors commit their draft; unchanged values are not reported.
  @action commitEdit() {
    const current = this.editing;
    if (!current) return;
    this.editing = null;
    const { row, key, column } = current;
    const before = row?.[key];
    let value = this.draft;
    if (column.editable === 'number') {
      value = value === '' ? null : Number(value);
      if (Number.isNaN(value)) return;
    }
    const same = (before == null ? '' : String(before)) === (value == null ? '' : String(value));
    if (same) return;
    this.args.onCellEdit(row, key, value);
  }

  // Select and search editors commit on pick.
  @action commitPick(value) {
    const current = this.editing;
    if (!current) return;
    this.editing = null;
    this.args.onCellEdit(current.row, current.key, value);
  }

  @action commitSearchPick(item) {
    this.commitPick(item);
  }

  @action handleEditorKeydown(event) {
    if (!this.editing) return;
    const kind = this.editing.column.editable;
    const textLike = kind === 'text' || kind === 'number';
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    } else if (event.key === 'Enter' && textLike) {
      event.preventDefault();
      this.commitEdit();
    } else if (event.key === 'Tab') {
      // The browser must not move focus itself; the next editor takes it.
      event.preventDefault();
      const next = this.adjacentEditable(event.shiftKey ? -1 : 1);
      if (textLike) this.commitEdit();
      else this.cancelEdit();
      if (next) this.startEdit(next.row, next.column);
    }
  }

  // Focus leaving the editor and its hosted menu ends the edit.
  @action handleEditorFocusOut(event) {
    const wrapper = event.currentTarget;
    const to = event.relatedTarget;
    if (to && (wrapper.contains(to) || this.layer.element.contains(to))) {
      return;
    }
    if (!this.editing || wrapper.dataset.key !== this.editing.key) return;
    const kind = this.editing.column.editable;
    if (kind === 'text' || kind === 'number') this.commitEdit();
    else this.cancelEdit();
  }

  // Next (or previous) editable cell in reading order, continuing on the next row.
  adjacentEditable(step) {
    const current = this.editing;
    if (!current) return null;
    const editableColumns = this.order
      .filter((key) => !this.hidden.includes(key))
      .map((key) => this.copies.get(key))
      .filter((column) => this.editorFor(column));
    const rows = this.rows;
    const rowIndex = rows.findIndex((row) => row?.id === current.row?.id);
    let columnIndex = editableColumns.findIndex(
      (column) => column.valuePath === current.key,
    );
    let nextRow = rowIndex;
    columnIndex += step;
    if (columnIndex >= editableColumns.length) {
      columnIndex = 0;
      nextRow += 1;
    } else if (columnIndex < 0) {
      columnIndex = editableColumns.length - 1;
      nextRow -= 1;
    }
    if (nextRow < 0 || nextRow >= rows.length) return null;
    return { row: rows[nextRow], column: editableColumns[columnIndex] };
  }

  // The editor takes focus once its own listeners are attached (a filter input
  // opens its menu on focus), so the focus is deferred by one task.
  focusEditor = modifier((element) => {
    const task = runTask(
      this,
      () => {
        const input = element.querySelector('input');
        input?.focus();
        input?.select?.();
      },
      0,
    );
    return () => cancelTask(this, task);
  });

  // RTL starts scrolled to the reading edge.
  startAtReadingEdge = modifier((element) => {
    if (!this.isRtl) return;
    const overflow = element.querySelector('.ember-table-overflow');
    if (overflow) overflow.scrollLeft = overflow.scrollWidth;
  });
}
