import pg from "pg";
import type { PoolConfig, PoolClient } from "pg";
import type { QueryResult, SqlPool, SqlSession } from "./types.ts";

class NodePgSession implements SqlSession {
  private readonly client: PoolClient;
  public constructor(client: PoolClient) { this.client = client; }
  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    const result = await this.client.query(text, values ? [...values] : undefined);
    return { rows: result.rows as readonly Row[], rowCount: result.rowCount };
  }
  public release(): void { this.client.release(); }
}

export class NodePgPool implements SqlPool {
  private readonly pool: pg.Pool;
  public constructor(config: PoolConfig) { this.pool = new pg.Pool(config); }
  public async connect(): Promise<SqlSession> { return new NodePgSession(await this.pool.connect()); }
  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    const result = await this.pool.query(text, values ? [...values] : undefined);
    return { rows: result.rows as readonly Row[], rowCount: result.rowCount };
  }
  public async end(): Promise<void> { await this.pool.end(); }
}
