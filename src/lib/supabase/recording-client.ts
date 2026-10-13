import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * A test double for the PostgREST builder: every chained call is recorded
 * per statement, and `await` resolves to what `respond` returns for that
 * statement. Tests assert the statements in order (table, operation, filters),
 * which is what the write-order rules depend on.
 */

export type RecordedOp = 'select' | 'update' | 'upsert' | 'delete';

export interface RecordedStatement {
  table: string;
  op: RecordedOp;
  /** Row(s) of an update or upsert, as sent. */
  payload?: unknown;
  /** Options of an upsert (onConflict, ignoreDuplicates). */
  options?: unknown;
  /** Filter and modifier calls in chain order, e.g. ['eq', 'lesson_id', 'x']. */
  filters: unknown[][];
}

export interface RecordedResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

export interface RecordingClient {
  client: SupabaseClient;
  statements: RecordedStatement[];
}

const FILTERS = ['eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'maybeSingle', 'select'] as const;

export function recordingClient(
  respond: (statement: RecordedStatement) => RecordedResult = () => ({ data: null, error: null }),
): RecordingClient {
  const statements: RecordedStatement[] = [];

  const builderFor = (table: string) => {
    const statement: RecordedStatement = { table, op: 'select', filters: [] };
    const builder: Record<string, unknown> = {};
    for (const name of FILTERS) {
      builder[name] = (...args: unknown[]) => {
        statement.filters.push([name, ...args]);
        return builder;
      };
    }
    builder.update = (payload: unknown) => {
      statement.op = 'update';
      statement.payload = payload;
      return builder;
    };
    builder.upsert = (payload: unknown, options?: unknown) => {
      statement.op = 'upsert';
      statement.payload = payload;
      statement.options = options;
      return builder;
    };
    builder.delete = () => {
      statement.op = 'delete';
      return builder;
    };
    builder.then = (resolve: (value: RecordedResult) => unknown, reject: (reason: unknown) => unknown) => {
      statements.push(statement);
      return Promise.resolve(respond(statement)).then(resolve, reject);
    };
    return builder;
  };

  const client = { from: (table: string) => builderFor(table) } as unknown as SupabaseClient;
  return { client, statements };
}
