// Validation status shared by Field, FieldGroup and the form controls.
//
// A control that resolves its own status renders `is-invalid`, `is-warning` or
// `is-valid` plus `aria-invalid="true"` for errors. A Field or FieldGroup
// writes the same state onto a control that has none of its own, using
// `aria-invalid` and `data-nu-field-status`. Styles key on both, so the visual
// state is always the one assistive technology hears.

export const STATUSES = Object.freeze(['error', 'warning', 'success']);

const STATUS_CLASSES = Object.freeze({
  error: 'is-invalid',
  warning: 'is-warning',
  success: 'is-valid',
});

const OWN_STATUS = '.is-invalid, .is-warning, .is-valid';
const FIELD_STATUS = 'data-nu-field-status';

// Attributes a Field wrote, so it removes only what it set and never a caller's own.
const written = new WeakMap();

// @status wins; @invalid aliases "error" and @valid aliases "success".
export function resolveStatus(args) {
  if (STATUSES.includes(args.status)) {
    return args.status;
  }
  if (args.invalid) {
    return 'error';
  }
  if (args.valid) {
    return 'success';
  }
  return null;
}

// A wrapper also reads a non-empty @error as "error", unless @status says otherwise.
export function resolveFieldStatus(args) {
  if (!STATUSES.includes(args.status) && args.error) {
    return 'error';
  }
  return resolveStatus(args);
}

export function statusClass(status) {
  return STATUS_CLASSES[status] ?? null;
}

// Hint id while the hint shows, error id while the error shows; the error replaces the hint.
export function messageIds(args, hintId, errorId) {
  if (args.error) {
    return [errorId];
  }
  return args.hint ? [hintId] : [];
}

function record(control) {
  let entry = written.get(control);
  if (!entry) {
    entry = { invalid: false, required: false };
    written.set(control, entry);
  }
  return entry;
}

// A control with a status argument of its own keeps it: the explicit argument wins.
export function applyStatus(control, status) {
  const entry = record(control);
  if (control.matches(OWN_STATUS)) {
    if (entry.invalid && !control.matches('.is-invalid')) {
      control.removeAttribute('aria-invalid');
    }
    entry.invalid = false;
    control.removeAttribute(FIELD_STATUS);
    return;
  }

  if (status === 'error') {
    if (control.getAttribute('aria-invalid') !== 'true') {
      control.setAttribute('aria-invalid', 'true');
      entry.invalid = true;
    }
  } else if (entry.invalid) {
    control.removeAttribute('aria-invalid');
    entry.invalid = false;
  }

  if (status) {
    control.setAttribute(FIELD_STATUS, status);
  } else {
    control.removeAttribute(FIELD_STATUS);
  }
}

export function applyRequired(control, required) {
  const entry = record(control);
  if (required) {
    if (control.getAttribute('aria-required') !== 'true') {
      control.setAttribute('aria-required', 'true');
      entry.required = true;
    }
  } else if (entry.required) {
    control.removeAttribute('aria-required');
    entry.required = false;
  }
}

// Own ids first, in order, then any id the caller or another service already set.
export function applyDescribedBy(element, ownIds, activeIds) {
  const others = (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id && !ownIds.includes(id));
  const next = [...activeIds, ...others];
  if (next.length) {
    element.setAttribute('aria-describedby', next.join(' '));
  } else {
    element.removeAttribute('aria-describedby');
  }
}
