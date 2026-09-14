import { Check, Package, Truck, Home, CreditCard } from "lucide-react";
import { CopiarCodigo } from "@/components/pedido/CopiarCodigo";

/**
 * A linha do tempo do pedido — uma peça só, usada em três lugares.
 *
 * Aparece na confirmação logo depois da compra, na lista de pedidos da conta e
 * na página do pedido. Ser o mesmo componente não é economia de código: é o que
 * garante que a pessoa reconheça a mesma tela quando voltar dias depois para
 * conferir a entrega. Se fossem implementações diferentes, elas divergiriam na
 * primeira mudança.
 *
 * `cancelado` não é uma etapa: é a interrupção da linha. Por isso não entra na
 * régua e tem tratamento próprio — mostrá-lo como "quinto passo" sugeriria que
 * o pedido continua andando.
 */

export const ETAPAS = [
  { chave: "aguardando_pagamento", rotulo: "Pedido recebido", icone: CreditCard },
  { chave: "pago", rotulo: "Pagamento confirmado", icone: Check },
  { chave: "em_producao", rotulo: "Em preparo", icone: Package },
  { chave: "enviado", rotulo: "A caminho", icone: Truck },
  { chave: "entregue", rotulo: "Entregue", icone: Home },
] as const;

/* A dica da primeira etapa depende de como se paga. Com o Mercado Pago ligado,
 * "estamos combinando o pagamento com você" seria mentira: a pessoa paga
 * sozinha, e o que ela espera é a confirmação. */
function dicaDaEtapa(chave: string, pagamentoOnline: boolean): string {
  switch (chave) {
    case "aguardando_pagamento":
      return pagamentoOnline
        ? "Aguardando a confirmação do pagamento."
        : "Estamos combinando o pagamento com você.";
    case "pago":
      return "Recebemos o valor e a sua peça entra em preparo.";
    case "em_producao":
      return "A peça está sendo preparada à mão para o envio.";
    case "enviado":
      return "Despachada. O código de rastreio aparece aqui.";
    default:
      return "A peça chegou. Que ela conte muitas histórias.";
  }
}

export type PedidoParaStatus = {
  numero: number;
  status: string;
  criadoEm: string;
  pagoEm: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  codigoRastreio: string | null;
  transportadora: string | null;
  motivoCancelamento: string | null;
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function quando(iso: string | null) {
  return iso ? dataHora.format(new Date(iso)) : null;
}

export function StatusDoPedido({
  pedido,
  pagamentoOnline = false,
}: {
  pedido: PedidoParaStatus;
  pagamentoOnline?: boolean;
}) {
  const cancelado = pedido.status === "cancelado";
  const atual = ETAPAS.findIndex((e) => e.chave === pedido.status);
  // Status desconhecido não deve apagar a régua inteira: na dúvida, mostra ao
  // menos a primeira etapa como cumprida, que é verdade para todo pedido.
  const indice = atual === -1 ? 0 : atual;

  const datas: Record<string, string | null> = {
    aguardando_pagamento: quando(pedido.criadoEm),
    pago: quando(pedido.pagoEm),
    em_producao: null,
    enviado: quando(pedido.enviadoEm),
    entregue: quando(pedido.entregueEm),
  };

  if (cancelado) {
    return (
      <div className="ped-status ped-status--cancelado">
        <p className="ped-status__cancelado-titulo">Pedido cancelado</p>
        <p className="ped-status__dica">
          {pedido.motivoCancelamento ? `${pedido.motivoCancelamento} ` : ""}
          As peças voltaram para o estoque. Se foi engano, fale com a Florenza pelo WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="ped-status">
      <ol className="ped-trilha">
        {ETAPAS.map((etapa, i) => {
          const cumprida = i < indice;
          const agora = i === indice;
          const Icone = etapa.icone;

          return (
            <li
              key={etapa.chave}
              className={`ped-trilha__etapa${cumprida ? " is-cumprida" : ""}${agora ? " is-atual" : ""}`}
            >
              <span className="ped-trilha__marca" aria-hidden>
                <Icone size={14} />
              </span>
              <div className="ped-trilha__texto">
                <p className="ped-trilha__rotulo">{etapa.rotulo}</p>
                {datas[etapa.chave] && (
                  <p className="ped-trilha__data">{datas[etapa.chave]}</p>
                )}
                {agora && <p className="ped-trilha__dica">{dicaDaEtapa(etapa.chave, pagamentoOnline)}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {pedido.codigoRastreio && (
        <div className="ped-rastreio">
          <p className="ped-rastreio__rotulo">
            Código de rastreio
            {pedido.transportadora && ` · ${pedido.transportadora}`}
          </p>
          <div className="ped-rastreio__linha">
            <code className="ped-rastreio__codigo">{pedido.codigoRastreio}</code>
            <CopiarCodigo valor={pedido.codigoRastreio} />
          </div>
          <p className="ped-status__dica">
            Leva algumas horas até a transportadora reconhecer o código depois da postagem.
          </p>
        </div>
      )}

      {!pedido.codigoRastreio && indice >= 3 && (
        <p className="ped-status__dica">
          O código de rastreio aparece aqui assim que a transportadora registrar a postagem.
        </p>
      )}
    </div>
  );
}
