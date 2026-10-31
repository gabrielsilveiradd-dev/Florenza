import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bancoDeTeste, migrations } from "./banco-de-teste";

const DE_PAGAMENTO = migrations().filter((a) => a >= "20261031120000");

describe("migrations de pagamento", () => {
  it("rodam de novo sem erro, e a conferência não acusa falha", async () => {
    const db = await bancoDeTeste();
    for (const arquivo of DE_PAGAMENTO) {
      const resultados = await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", arquivo), "utf8"));
      const conferencia = JSON.stringify(resultados.at(-1)?.rows ?? []);
      expect(conferencia, arquivo).not.toContain("FALHOU");
    }
    await db.close();
  });

  it("toda tabela do schema public tem RLS", async () => {
    const db = await bancoDeTeste();
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    );
    expect(r.rows.map((l) => l.relname)).toEqual([]);
    await db.close();
  });

  it("toda chave estrangeira das tabelas de pagamento tem índice", async () => {
    const db = await bancoDeTeste();
    const r = await db.query<{ tabela: string; restricao: string }>(
      `select con.conrelid::regclass::text as tabela, con.conname as restricao
         from pg_constraint con
        where con.contype = 'f'
          and con.conrelid::regclass::text in (
            'pagbank_checkouts', 'pagbank_orders', 'payment_events', 'pagamento_disputas', 'pagamento_estornos', 'payment_logs'
          )
          and not exists (
            select 1 from pg_index i
             where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1]
          )`
    );
    expect(r.rows).toEqual([]);
    await db.close();
  });
});
