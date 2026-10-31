import { after, NextResponse, type NextRequest } from "next/server";
import { pagBankConfigurado } from "@/lib/pagamento/config";
import { receberAviso } from "@/lib/pagamento/webhook";

/**
 * Aviso de pagamento do PagBank.
 *
 * Responde rápido: confere a autenticidade, grava o corpo cru em `payment_events`
 * e devolve 200. O processamento roda em `after()`, e o que falhar ali o job
 * refaz. Só responde 500 se nem gravar deu certo.
 *
 * O corpo é lido cru, e não com `request.json()`: a assinatura é calculada sobre
 * os bytes exatos, e reformatar o JSON a invalidaria.
 */
export async function POST(request: NextRequest) {
  if (!pagBankConfigurado()) {
    return NextResponse.json({ ignorado: "pagamento online desligado" });
  }

  try {
    const resultado = await receberAviso({
      corpoCru: await request.text(),
      cabecalhos: request.headers,
      numeroAssinado: { p: request.nextUrl.searchParams.get("p"), s: request.nextUrl.searchParams.get("s") },
    });

    if (resultado.http === 200 && resultado.depois) after(resultado.depois);
    return NextResponse.json(resultado.corpo, { status: resultado.http });
  } catch (e) {
    console.error("[webhook] aviso não gravado:", e);
    return NextResponse.json({ erro: "falha ao gravar" }, { status: 500 });
  }
}
