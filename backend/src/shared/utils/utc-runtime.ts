import * as pg from 'pg';

interface PgTypeRegistry {
  builtins: { DATE: number };
  setTypeParser(oid: number, parse: (value: string) => unknown): void;
}

// Date math and pg parameter encoding must not depend on the host clock.
process.env.TZ = 'UTC';

// DATE is a calendar day; parsing it into a Date would pin it to a midnight instant.
const { types } = pg as unknown as { types: PgTypeRegistry };
types.setTypeParser(types.builtins.DATE, (value: string) => value);
