import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aliancasDaLinha, precoDaUnidade } from "@/lib/aros";
import { chaveDoItem } from "@/lib/carrinho";
import { SEGREDO, bancoDeTeste } from "../pagamento/banco-de-teste";

/** A unidade de aliança pela função real, num Postgres com as migrations reais. */

let db: PGlite;
let cliente: string;
let sequencia = 0;

type Linha = { sku: string; quantidade?: number; tamanho?: number; tamanho_par?: number; avulsa?: boolean; preco_centavos?: number };

async function peca(aros: number, preco = 189_000, estoque = 10): Promise<string> {
  const sku = `T${++sequencia}`;
  await db.query(
    `insert into public.produtos (sku, slug, categoria_slug, nome, preco_centavos, estoque, aros)
     values ($1, $2, 'testes', 'Aliança Teste', $3, $4, $5)`,
    [sku, sku.toLowerCase(), preco, estoque, aros]
  );
  return sku;
}

async function fechar(itens: Linha[]) {
  const r = await db.query<{ pedido_id: string; pedido_total_centavos: number }>(
    `select * from public.criar_pedido(
       p_itens => $1::jsonb, p_cep => '26525060', p_logradouro => 'Rua Um', p_endereco_numero => '1',
       p_bairro => 'Centro', p_cidade => 'Nilópolis', p_uf => 'RJ', p_frete => 'economica')`,
    [JSON.stringify(itens)]
  );
  const pedido = r.rows[0];
  const linhas = await db.query<{
    nome: string; preco_centavos: number; quantidade: number; aros: number; tamanho: number | null; tamanho_par: number | null;
  }>("select nome, preco_centavos, quantidade, aros, tamanho, tamanho_par from public.pedido_itens where pedido_id = $1 order by aros", [pedido.pedido_id]);
  return { ...pedido, linhas: linhas.rows };
}

const estoque = async (sku: string) =>
  (await db.query<{ estoque: number }>("select estoque from public.produtos where sku = $1", [sku])).rows[0].estoque;

beforeAll(async () => {
  db = await bancoDeTeste();
  await db.query("insert into public.categorias (slug, nome) values ('testes', 'Testes') on conflict do nothing");
  const u = await db.query<{ id: string }>("insert into auth.users (email) values ('cliente@exemplo.com') returning id");
  cliente = u.rows[0].id;
  await db.query(
    `insert into public.profiles (id, nome, telefone, cpf) values ($1, 'Cliente', '21999998888', '52998224725')
     on conflict (id) do update set nome = excluded.nome, telefone = excluded.telefone, cpf = excluded.cpf`,
    [cliente]
  );
  await db.query("select set_config('request.jwt.sub', $1, false)", [cliente]);
});

afterAll(async () => {
  await db.close();
});

// O limite é de 3 pedidos aguardando por conta.
beforeEach(async () => {
  await db.query("update public.pedidos set status = 'cancelado' where status = 'aguardando_pagamento'");
});

describe("par", () => {
  it("segue com o preço cheio e as duas medidas", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 16, tamanho_par: 20 }]);
    expect(p.linhas[0]).toMatchObject({ nome: "Aliança Teste", preco_centavos: 189_000, aros: 2, tamanho: 16, tamanho_par: 20 });
    expect(await estoque(sku)).toBe(8);
  });

  it("com uma aliança só no estoque, não sai", async () => {
    const sku = await peca(2, 100_000, 1);
    await expect(fechar([{ sku, tamanho: 16, tamanho_par: 20 }])).rejects.toThrow("Restam 1 aliança");
    expect(await estoque(sku)).toBe(1);
  });

  it("cancelar devolve as duas alianças, e reativar tira de novo", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 16, tamanho_par: 20, quantidade: 2 }]);
    expect(await estoque(sku)).toBe(6);
    await db.query("update public.pedidos set status = 'cancelado' where id = $1", [p.pedido_id]);
    expect(await estoque(sku)).toBe(10);
    await db.query("update public.pedidos set status = 'aguardando_pagamento' where id = $1", [p.pedido_id]);
    expect(await estoque(sku)).toBe(6);
  });

  it("devolver depois de um estorno também conta as duas", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 16, tamanho_par: 20 }]);
    await db.query("select public.pagbank_decidir_estoque($1, $2, true)", [SEGREDO, p.pedido_id]);
    expect(await estoque(sku)).toBe(10);
  });

  it("sem a segunda medida é recusado", async () => {
    const sku = await peca(2);
    await expect(fechar([{ sku, tamanho: 16 }])).rejects.toThrow("duas medidas");
  });
});

describe("unidade", () => {
  it("custa a metade, tem um aro e baixa 1 do estoque", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true }]);
    expect(p.linhas[0]).toMatchObject({ nome: "Aliança Teste (unidade)", preco_centavos: 94_500, aros: 1, tamanho: 18, tamanho_par: null });
    expect(p.pedido_total_centavos).toBe(94_500 + 2_490);
    expect(await estoque(sku)).toBe(9);
  });

  it("centavo ímpar arredonda para cima, igual à tela", async () => {
    const sku = await peca(2, 36_901);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true }]);
    expect(p.linhas[0].preco_centavos).toBe(18_451);
    expect(precoDaUnidade(36_901)).toBe(18_451);
    expect(precoDaUnidade(36_900)).toBe(18_450);
  });

  it("ignora o preço mandado pelo navegador", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true, preco_centavos: 1 }]);
    expect(p.linhas[0].preco_centavos).toBe(94_500);
  });

  it.each([1, 0])("peça com aros %i não sai pela metade", async (aros) => {
    const sku = await peca(aros);
    await expect(fechar([{ sku, tamanho: 18, avulsa: true }])).rejects.toThrow("não é vendida por unidade");
    expect(await estoque(sku)).toBe(10);
  });

  it("sem a medida é recusada", async () => {
    const sku = await peca(2);
    await expect(fechar([{ sku, avulsa: true }])).rejects.toThrow("medida do aro");
  });

  it("descarta a segunda medida", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 18, tamanho_par: 20, avulsa: true }]);
    expect(p.linhas[0].tamanho_par).toBeNull();
  });

  it("par e unidade da mesma peça viram duas linhas, e o estoque soma as duas", async () => {
    const sku = await peca(2, 100_000, 3);
    const p = await fechar([
      { sku, tamanho: 16, tamanho_par: 20, avulsa: false },
      { sku, tamanho: 18, avulsa: true },
    ]);
    expect(p.linhas.map((l) => l.preco_centavos).sort((a, b) => a - b)).toEqual([50_000, 100_000]);
    expect(await estoque(sku)).toBe(0);
  });

  it("não vende além do estoque", async () => {
    const sku = await peca(2, 100_000, 2);
    await expect(
      fechar([
        { sku, tamanho: 16, tamanho_par: 20 },
        { sku, tamanho: 18, avulsa: true },
      ])
    ).rejects.toThrow("Restam 2");
    expect(await estoque(sku)).toBe(2);
  });

  it("cancelar devolve o estoque", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true }]);
    expect(await estoque(sku)).toBe(9);
    await db.query("update public.pedidos set status = 'cancelado' where id = $1", [p.pedido_id]);
    expect(await estoque(sku)).toBe(10);
  });

  it("o ranking do painel mostra o nome da peça, sem \"(unidade)\"", async () => {
    const sku = await peca(2);
    const p = await fechar([{ sku, tamanho: 18, avulsa: true }]);
    await db.query("update public.pedidos set status = 'pago' where id = $1", [p.pedido_id]);
    const r = await db.query<{ nome: string }>("select nome from public.vw_produtos_vendidos where sku = $1", [sku]);
    expect(r.rows[0].nome).toBe("Aliança Teste");
  });
});

describe("carrinho", () => {
  it("o estoque ocupado é o mesmo do banco", async () => {
    for (const [quantidade, aros] of [[1, 2], [3, 2], [1, 1], [3, 1], [2, 0]]) {
      const r = await db.query<{ n: number }>("select public.aliancas_da_linha($1, $2) as n", [quantidade, aros]);
      expect(aliancasDaLinha(quantidade, aros)).toBe(r.rows[0].n);
    }
  });


  it("par e unidade de mesma medida são linhas diferentes", () => {
    const base = { sku: "002", tamanho: 18, tamanhoPar: null };
    expect(chaveDoItem(base)).not.toBe(chaveDoItem({ ...base, avulsa: true }));
    expect(chaveDoItem(base)).toBe("002|18|-");
  });
});
