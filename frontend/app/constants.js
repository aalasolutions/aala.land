// Single source of truth lives in the shared `@land/taxonomies` package.
// This module re-exports it so existing `import ... from 'land/constants'`
// calls keep working unchanged.
export * from '@land/taxonomies';
