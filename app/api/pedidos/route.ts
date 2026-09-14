import { after, NextResponse } from "next/server";
import { avisarPedidoNovo, pedidoParaAviso } from "@/lib/avisos";
import { buscarMeuPedido } from "@/lib/conta-servidor";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { criarPreferencia } from "@/lib/pagamento/mercado-pago";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { urlDoSite } from "@/lib/url-do-site";

/**
 * Fechar o pedido.
 *
 * Antes o navegador chamava `criar_pedido()` direto. Continua sendo o banco que
 * decide tudo — estoque, preço, cupom, reserva —, e a chamada continua saindo
 * com a sessão de quem compra. O servidor entrou no meio por duas coisas que o
 * navegador não pode fazer:
 *
 *   - avisar a Florenza (a chave do serviço de e-mail não vai para o navegador);
 *   - abrir a cobrança no Mercado Pago (o token da loja, menos ainda).
 *
 * O que NÃO é mandado continua não sendo: preço, total, desconto e status.
 */

type PedidoCriado = {
  pedido_id: string;
  pedido_numero: number;
  pedido_total_centavos: number;
  pedido_expira_em: string;
};

const texto = (valor: unknown) => (typeof valor === "string" ? valor : null);
const tamanho = (valor: unknown) => (typeof valor === "number" && Number.isInteger(valor) ? valor : null);

export async function POST(request: Request) {
  if (!supabaseConfigurado()) {
    return NextResponse.json({ erro: "O Supabase não está conectado nesta cópia do site." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Entre na sua conta para fechar o pedido." }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler o pedido." }, { status: 400 });
  }

  // Só a forma é conferida aqui; o conteúdo, quem confere é o banco.
  const itens = (Array.isArray(corpo.itens) ? corpo.itens : []).slice(0, 50).map((bruto) => {
    const i = (bruto ?? {}) as Record<string, unknown>;
    return {
      sku: texto(i.sku) ?? "",
      quantidade: typeof i.quantidade === "number" ? i.quantidade : 1,
      tamanho: tamanho(i.tamanho),
      tamanho_par: tamanho(i.tamanhoPar),
    };
  });

  const { data, error } = await supabase.rpc("criar_pedido", {
    p_itens: itens,
    p_cep: texto(corpo.cep),
    p_logradouro: texto(corpo.logradouro),
    p_endereco_numero: texto(corpo.enderecoNumero),
    p_bairro: texto(corpo.bairro),
    p_cidade: texto(corpo.cidade),
    p_uf: texto(corpo.uf),
    p_complemento: texto(corpo.complemento),
    p_nome: texto(corpo.nome),
    p_telefone: texto(corpo.telefone),
    p_cpf: texto(corpo.cpf),
    p_observacoes: texto(corpo.observacoes),
    p_cupom: texto(corpo.cupom),
    p_presente: corpo.presente === true,
    p_mensagem_presente: texto(corpo.mensagemPresente),
  });

  if (error) {
    // P0001 é o código das mensagens escritas na própria função — já em
    // português e já falando de peça e quantidade. Repassar é melhor que
    // traduzir de novo e pior.
    if (error.code === "P0001") {
      return NextResponse.json({ erro: error.message }, { status: 400 });
    }
    console.error("[pedidos] criar_pedido falhou:", error);
    return NextResponse.json(
      { erro: "Não foi possível registrar o pedido. Tente de novo em instantes." },
      { status: 500 }
    );
  }

  const criado = (Array.isArray(data) ? data[0] : data) as PedidoCriado | null;
  if (!criado) {
    return NextResponse.json(
      { erro: "Não foi possível registrar o pedido. Tente de novo em instantes." },
      { status: 500 }
    );
  }

  const urlBase = await urlDoSite();
  const pedido = await buscarMeuPedido({ id: criado.pedido_id });

  // Depois da resposta: a pessoa não espera o e-mail sair para ver a
  // confirmação, e um serviço de e-mail lento não segura a compra.
  if (pedido) after(() => avisarPedidoNovo(pedidoParaAviso(pedido), urlBase));

  let pagamentoUrl: string | null = null;
  let erroPagamento: string | null = null;

  if (pagamentoOnlineAtivo() && pedido && pedido.totalCentavos > 0) {
    try {
      pagamentoUrl = await criarPreferencia({
        pedidoId: pedido.id,
        numero: pedido.numero,
        totalCentavos: pedido.totalCentavos,
        expiraEm: pedido.expiraEm,
        itens: pedido.itens,
        comprador: { nome: pedido.nome, email: pedido.email, cpf: pedido.cpf },
        urlBase,
      });
    } catch (e) {
      // O pedido existe e a peça está reservada: falhar aqui não pode desfazer
      // a compra. A página do pedido tem o botão para tentar de novo.
      console.error(`[pedidos] preferência do pedido #${pedido.numero} falhou:`, e);
      erroPagamento =
        "O pedido foi registrado e as peças estão reservadas, mas o pagamento não abriu agora. " +
        "Tente pagar pela página do pedido.";
    }
  }

  return NextResponse.json({
    numero: criado.pedido_numero,
    totalCentavos: criado.pedido_total_centavos,
    expiraEm: criado.pedido_expira_em,
    pagamentoUrl,
    erroPagamento,
  });
}
