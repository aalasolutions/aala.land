// Mirrors $wu-variants in _var.scss; `secondary` is accepted and renders no modifier.
export const VARIANTS = Object.freeze(['brand', 'success', 'warning', 'danger', 'info']);

export const TAG_MODIFIERS = Object.freeze({
  brand: 'brand',
  secondary: 'gray',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
});

// Kit sizes are sm, default and lg; xs and xl fold into the nearest.
export const SIZE_MAP = Object.freeze({ xs: 'sm', sm: 'sm', lg: 'lg', xl: 'lg' });
