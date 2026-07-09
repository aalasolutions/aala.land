// PropertyType was a Postgres enum on units.property_type and
// buildings.property_type. It has been killed to varchar(100) and its allowed
// values now live in @land/taxonomies (PROPERTY_TYPE_OPTIONS) and the derived
// PROPERTY_TYPE_VALUES in src/shared/taxonomies.ts. This file is intentionally
// left as a marker; nothing imports it. (Table note: the Asset entity maps to
// the `buildings` table, so the converted enum type is buildings_property_type_enum.)
export {};
