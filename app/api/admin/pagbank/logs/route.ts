import { NextResponse, type NextRequest } from "next/server";
import { exigirAdmin } from "@/lib/admin/exigir-admin";

/**
 * Exporta o log das chamadas ao PagBank, para anexar na homologação.
 * `?formato=json|csv&dias=30&ambiente=sandbox|production`. Lido com a sessão de quem
 * pediu: a RLS de `payment_logs` só abre para admin.
 */
const COLUNAS = [
  "created_at", "ambiente", "metodo", "caminho", "http_status", "duracao_ms", "requisicao", "resposta", "erro",
] as const;

type Linha = Record<(typeof COLUNAS)[number], string | number | null>;

function celula(valor: string | number | null): string {
  const texto = String(valor ?? "");
  // Início com = + - @ vira fórmula ao abrir no Excel.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const acesso = await exigirAdmin();
  if ("resposta" in acesso) return acesso.resposta;

  const busca = request.nextUrl.searchParams;
  const dias = Math.min(Math.max(Number(busca.get("dias")) || 30, 1), 180);
  const ambiente = busca.get("ambiente");

  let consulta = acesso.supabase
    .from("payment_logs")
    .select(COLUNAS.join(", "))
    .gte("created_at", new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  if (ambiente === "sandbox" || ambiente === "production") consulta = consulta.eq("ambiente", ambiente);

  const { data, error } = await consulta;
  if (error) return NextResponse.json({ erro: "Não foi possível ler o log." }, { status: 500 });

  const linhas = (data ?? []) as unknown as Linha[];
  const data_ = new Date().toISOString().slice(0, 10);

  if (busca.get("formato") === "csv") {
    const csv = [COLUNAS.join(","), ...linhas.map((l) => COLUNAS.map((c) => celula(l[c])).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pagbank-logs-${data_}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(linhas, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pagbank-logs-${data_}.json"`,
    },
  });
}
