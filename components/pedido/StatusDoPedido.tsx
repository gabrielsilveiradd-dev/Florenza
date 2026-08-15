import { Check, Package, Truck, Home, CreditCard } from "lucide-react";
import { CopiarCodigo } from "@/components/pedido/CopiarCodigo";

/**
 * A linha do tempo do pedido — uma peça só, usada em dois lugares.
 *
 * Aparece na confirmação logo depois da compra e na aba de pedidos da conta.
 * Ser o mesmo componente não é economia de código: é o que garante que a pessoa
 * reconheça a mesma tela quando voltar dias depois para conferir a entrega. Se
 * fossem duas implementações, elas divergiriam na primeira mudança.
 *
 * `cancelado` não é uma etapa: é a interrupção da linha. Por isso não entra na
 * régua e tem tratamento próprio — mostrá-lo como "quinto passo" sugeriria que
 * o pedido continua andando.
 */

export const ETAPAS = [
  { chave: "aguardando_pagamento", rotulo: "Pedido recebido", icone: CreditCard,
    dica: "Estamos combinando o pagamento com você." },
  { chave: "pago", rotulo: "Pagamento confirmado", icone: Check,
    dica: "Recebemos o valor e a produção entra na fila." },
  { chave: "em_producao", rotulo: "Em produção", icone: Package,
    dica: "A peça está sendo preparada à mão." },
  { chave: "enviado", rotulo: "A caminho", icone: Truck,
    dica: "Despachada. O código de rastreio aparece aqui." },
  { chave: "entregue", rotulo: "Entregue", icone: Home,
    dica: "A peça chegou. Boa sorte com ela." },
] as const;

export type PedidoParaStatus = {
  numero: number;
  status: string;
  criadoEm: string;
  pagoEm: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  codigoRastreio: string | null;
  transportadora: string | null;
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function quando(iso: string | null) {
  return iso ? dataHora.format(new Date(iso)) : null;
}

export function StatusDoPedido({ pedido }: { pedido: PedidoParaStatus }) {
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
                {agora && <p className="ped-trilha__dica">{etapa.dica}</p>}
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
