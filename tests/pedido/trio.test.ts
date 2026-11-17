import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rotuloDoConjunto, vendeUnidade } from "@/lib/aros";
import { bancoDeTeste } from "../pagamento/banco-de-teste";

/** O trio (par + solitário) pela função real, num Postgres com as migrations reais. */

let db: PGlite;
let sequencia = 0;

async function peca(conjunto: "par" | "trio", preco = 49_000, estoque = 10): Promise<string> {
  const sku = `TR${++sequencia}`;
  await db.query(
    `insert into public.produtos (sku, slug, categoria_slug, nome, preco_centavos, estoque, aros, conjunto)
     values ($1, $2, 'testes', 'Trio Teste', $3, $4, 2, $5)`,
    [sku, sku.toLowerCase(), preco, estoque, conjunto]
  );
  return sku;
}

async function fechar(itens: object[]) {
  const r = await db.query<{ pedido_id: string; pedido_total_centavos: number }>(
    `select * from public.criar_pedido(
       p_itens => $1::jsonb, p_cep => '26525060', p_logradouro => 'Rua Um', p_endereco_numero => '1',
       p_bairro => 'Centro', p_cidade => 'Nilópolis', p_uf => 'RJ', p_frete => 'economica')`,
    [JSON.stringify(itens)]
  );
  const pedido = r.rows[0];
  const linhas = await db.query<{ nome: string; preco_centavos: number; aros: number; tamanho: number; tamanho_par: number }>(
    "select nome, preco_centavos, aros, tamanho, tamanho_par from public.pedido_itens where pedido_id = $1",
    [pedido.pedido_id]
  );
  return { ...pedido, linhas: linhas.rows };
}

const estoque = async (sku: string) =>
  (await db.query<{ estoque: number }>("select estoque from public.produtos where sku = $1", [sku])).rows[0].estoque;

beforeAll(async () => {
  db = await bancoDeTeste();
  await db.query("insert into public.categorias (slug, nome) values ('testes', 'Testes') on conflict do nothing");
  const u = await db.query<{ id: string }>("insert into auth.users (email) values ('trio@exemplo.com') returning id");
  const cliente = u.rows[0].id;
  await db.query(
    `insert into public.profiles (id, nome, telefone, cpf) values ($1, 'Cliente', '21999998888', '52998224725')
     on conflict (id) do update set nome = excluded.nome, telefone = excluded.telefone, cpf = excluded.cpf`,
    [cliente]
  );
  await db.query("select set_config('request.jwt.sub', $1, false)", [cliente]);
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.query("update public.pedidos set status = 'cancelado' where status = 'aguardando_pagamento'");
});

describe("trio", () => {
  it("sai inteiro, pelo preço cheio, com as duas medidas, e baixa 2", async () => {
    const sku = await peca("trio");
    const p = await fechar([{ sku, tamanho: 16, tamanho_par: 20 }]);
    expect(p.linhas[0]).toMatchObject({ nome: "Trio Teste", preco_centavos: 49_000, aros: 2, tamanho: 16, tamanho_par: 20 });
    expect(await estoque(sku)).toBe(8);
  });

  it("recusa a unidade mesmo com a requisição forjada, e não mexe no estoque", async () => {
    const sku = await peca("trio");
    await expect(fechar([{ sku, tamanho: 18, avulsa: true }])).rejects.toThrow("só como trio");
    expect(await estoque(sku)).toBe(10);
  });

  it("par continua vendendo a unidade", async () => {
    const sku = await peca("par", 30_000);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true }]);
    expect(p.linhas[0]).toMatchObject({ preco_centavos: 15_000, aros: 1 });
  });

  it("o banco não aceita outro conjunto", async () => {
    await expect(peca("quarteto" as "par")).rejects.toThrow("produtos_conjunto_valido");
  });
});

describe("tela", () => {
  it("só o par oferece unidade, e o rótulo segue o conjunto", () => {
    expect(vendeUnidade({ aros: 2 })).toBe(true);
    expect(vendeUnidade({ aros: 2, conjunto: "trio" })).toBe(false);
    expect(vendeUnidade({ aros: 1 })).toBe(false);
    expect(rotuloDoConjunto({ aros: 2, conjunto: "trio" })).toBe("trio");
    expect(rotuloDoConjunto({ aros: 2 })).toBe("par");
    expect(rotuloDoConjunto({ aros: 1, conjunto: "trio" })).toBeNull();
  });
});
