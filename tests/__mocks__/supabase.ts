/**
 * Minimal Supabase client mock for unit tests.
 *
 * Covers the surface used by lib/pagos, lib/comprobantes and lib/clientes:
 * - from(table).select(cols?).eq().gt().is().order() (chainable, thenable)
 * - from(table).insert(payload).select().single()
 * - from(table).update(payload).eq().select().single()
 * - from(table).select().single() / maybeSingle()
 * - rpc(name, args)
 *
 * Usage:
 *   const { client, setTable, setRpc, reset } = createMockSupabase();
 *   setTable("payment", { data: [{ id: "1", amount: 100 }], error: null });
 *   setRpc("create_payment_with_allocations", { data: "uuid-123", error: null });
 *
 *   // then inject into the module under test via vi.mock("@/lib/supabase/client", () => ({ supabase: client }));
 */

type AnyRow = Record<string, unknown>;

type Result<T> = { data: T; error: null } | { data: null; error: unknown };

type TableResult = Result<AnyRow[]>;
type SingleResult = Result<AnyRow>;
type RpcResult = Result<unknown>;

interface QueryBuilder {
  select: (cols?: string) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  update: (payload: unknown) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  gt: (col: string, val: unknown) => QueryBuilder;
  is: (col: string, val: unknown) => QueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => QueryBuilder;
  single: () => Promise<SingleResult>;
  maybeSingle: () => Promise<SingleResult>;
  then: <TResult1 = TableResult, TResult2 = never>(
    onfulfilled?: (value: TableResult) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ) => Promise<TResult1 | TResult2>;
}

export interface MockSupabase {
  client: {
    from: (table: string) => QueryBuilder;
    rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  };
  setTable: (table: string, result: TableResult) => void;
  setRpc: (name: string, result: RpcResult) => void;
  /** Queue a one-shot result for the next call to the given table; consumed in FIFO order. */
  queueTable: (table: string, result: TableResult) => void;
  /** Queue a one-shot result for the next call to the given RPC; consumed in FIFO order. */
  queueRpc: (name: string, result: RpcResult) => void;
  reset: () => void;
}

function emptyTable(): TableResult {
  return { data: [], error: null };
}

function emptyRpc(): RpcResult {
  return { data: null, error: null };
}

export function createMockSupabase(): MockSupabase {
  const tables = new Map<string, TableResult>();
  const rpcs = new Map<string, RpcResult>();
  const tableQueues = new Map<string, TableResult[]>();
  const rpcQueues = new Map<string, RpcResult[]>();

  function nextTableResult(table: string): TableResult {
    const queue = tableQueues.get(table);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) tableQueues.delete(table);
      return next;
    }
    return tables.get(table) ?? emptyTable();
  }

  function nextRpcResult(name: string): RpcResult {
    const queue = rpcQueues.get(name);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) rpcQueues.delete(name);
      return next;
    }
    return rpcs.get(name) ?? emptyRpc();
  }

  function makeBuilder(table: string): QueryBuilder {
    const builder: QueryBuilder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      eq: () => builder,
      gt: () => builder,
      is: () => builder,
      order: () => builder,
      single: async () => {
        const result = nextTableResult(table);
        if (result.error !== null) return { data: null, error: result.error };
        const first = (result.data as AnyRow[])[0] ?? null;
        return { data: first, error: null };
      },
      maybeSingle: async () => {
        const result = nextTableResult(table);
        if (result.error !== null) return { data: null, error: result.error };
        const first = (result.data as AnyRow[])[0] ?? null;
        return { data: first, error: null };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(nextTableResult(table)).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return {
    client: {
      from: (table) => makeBuilder(table),
      rpc: async (name) => nextRpcResult(name),
    },
    setTable(table, result) {
      tables.set(table, result);
    },
    setRpc(name, result) {
      rpcs.set(name, result);
    },
    queueTable(table, result) {
      const queue = tableQueues.get(table) ?? [];
      queue.push(result);
      tableQueues.set(table, queue);
    },
    queueRpc(name, result) {
      const queue = rpcQueues.get(name) ?? [];
      queue.push(result);
      rpcQueues.set(name, queue);
    },
    reset() {
      tables.clear();
      rpcs.clear();
      tableQueues.clear();
      rpcQueues.clear();
    },
  };
}
