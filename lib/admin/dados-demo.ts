/* DADOS DE DEMONSTRAÇÃO — só aparecem enquanto o Supabase não está plugado.
 *
 * Por que existir: sem chaves configuradas o painel abriria com todos os
 * números zerados, o mapa cinza e os gráficos vazios — impossível saber se ele
 * está certo ou quebrado. Com estes dados dá para conferir o layout, a escala
 * do mapa, os eixos e os estados vazios antes de existir um banco.
 *
 * Assim que NEXT_PUBLIC_SUPABASE_URL existir, nada daqui é usado. O painel
 * mostra um aviso em cima enquanto está neste modo, para ninguém confundir
 * exemplo com faturamento de verdade.
 *
 * Tudo é determinístico: mesma entrada, mesma saída. Nenhum Math.random(), para
 * a tela não mudar a cada recarga e uma captura poder ser comparada com outra.
 */
import { produtos } from "@/lib/data/catalogo-local";
// Só o tipo: apagado na compilação, então listas.ts importar este arquivo e
// este importar o tipo de lá não vira dependência circular em runtime.
import type { CupomAdmin, PedidoAdmin } from "@/lib/admin/listas";

/* Mesmo formato do pedido real, para a ficha do painel ter o que mostrar. CPF
 * fica vazio de propósito: nem de exemplo o projeto carrega número de CPF. */
export type PedidoDemo = PedidoAdmin;

/* Distribuição desenhada à mão em vez de sorteada: reproduz a concentração real
 * do varejo brasileiro (Sudeste pesado, Norte ralo). Um sorteio uniforme pintaria
 * o mapa quase todo igual e esconderia justamente o que ele existe para mostrar. */
const DISTRIBUICAO: Array<[uf: string, cidade: string, pedidos: number]> = [
  ["SP", "São Paulo", 14],
  ["MG", "Belo Horizonte", 9],
  ["RJ", "Rio de Janeiro", 7],
  ["PR", "Curitiba", 5],
  ["RS", "Porto Alegre", 4],
  ["BA", "Salvador", 4],
  ["SC", "Florianópolis", 3],
  ["GO", "Goiânia", 3],
  ["PE", "Recife", 3],
  ["CE", "Fortaleza", 2],
  ["ES", "Vitória", 2],
  ["DF", "Brasília", 2],
  ["MT", "Cuiabá", 1],
  ["MS", "Campo Grande", 1],
  ["PA", "Belém", 1],
  ["AM", "Manaus", 1],
  ["MA", "São Luís", 1],
  ["RN", "Natal", 1],
];

const NOMES = [
  "Ana Beatriz Moraes", "Carlos Eduardo Lima", "Mariana Prado", "Rafael Antunes",
  "Juliana Castro", "Fernando Rocha", "Patrícia Nogueira", "Bruno Sales",
  "Camila Ferraz", "Diego Marinho", "Letícia Vasques", "Thiago Bandeira",
  "Renata Siqueira", "Gustavo Peixoto", "Isabela Duarte", "Marcelo Tavares",
];

const ORIGENS = ["site", "whatsapp", "instagram", "loja", "indicacao"];
const STATUS = ["entregue", "pago", "enviado", "em_producao", "pago", "entregue", "aguardando_pagamento", "cancelado"];

/** Data determinística: espalha os pedidos pelos últimos 11 meses. */
function dataDoPedido(indice: number, total: number): string {
  const agora = new Date();
  // Mais recentes concentram mais pedidos — uma loja que está crescendo.
  const mesesAtras = Math.floor(((total - indice) / total) ** 1.6 * 11);
  const diaSorteado = ((indice * 7) % 27) + 1;
  // No mês corrente o dia não pode passar de hoje: pedido com data no futuro
  // faria o painel parecer quebrado, e sairia da conta de "faturamento do mês".
  const dia = mesesAtras === 0 ? Math.min(diaSorteado, agora.getDate()) : diaSorteado;
  const d = new Date(agora.getFullYear(), agora.getMonth() - mesesAtras, dia, 14, 30);
  return d.toISOString();
}

function construirPedidos(): PedidoDemo[] {
  const lista: PedidoDemo[] = [];
  const total = DISTRIBUICAO.reduce((s, [, , n]) => s + n, 0);
  let i = 0;

  for (const [uf, cidade, quantos] of DISTRIBUICAO) {
    for (let k = 0; k < quantos; k++) {
      const produto = produtos[i % produtos.length];
      const quantidade = i % 11 === 0 ? 2 : 1;
      const item = {
        sku: produto.sku,
        nome: produto.nome,
        preco_centavos: produto.precoCentavos,
        quantidade,
        aros: produto.aros,
        // Um em cada quatro sem medida — pedido de antes de a medida ser
        // obrigatória, que a ficha ainda precisa deixar à vista.
        tamanho: produto.aros >= 1 && i % 4 !== 0 ? 14 + (i % 8) : null,
        tamanho_par: produto.aros === 2 && i % 4 !== 0 ? 18 + (i % 6) : null,
      };
      const nome = NOMES[i % NOMES.length];
      const status = STATUS[i % STATUS.length];
      const criadoEm = dataDoPedido(i, total);
      const valor = produto.precoCentavos * quantidade;
      const despachado = status === "enviado" || status === "entregue";

      lista.push({
        id: `demo-${i}`,
        numero: 1000 + i,
        nome,
        email: `${nome.split(" ")[0].toLowerCase()}@exemplo.com`,
        telefone: i % 2 === 0 ? `(11) 9 8765-${String(4000 + i)}` : null,
        cpf: null,
        cep: null,
        logradouro: i % 3 === 0 ? "Rua das Acácias" : null,
        endereco_numero: i % 3 === 0 ? String(100 + i) : null,
        complemento: null,
        bairro: i % 3 === 0 ? "Centro" : null,
        cidade,
        uf,
        origem: ORIGENS[i % ORIGENS.length],
        status,
        subtotal_centavos: valor,
        desconto_centavos: 0,
        cupom_codigo: null,
        // Pedidos de demonstração são anteriores ao frete: sem forma de envio.
        frete_nome: null,
        frete_centavos: 0,
        frete_prazo_min_dias: null,
        frete_prazo_max_dias: null,
        total_centavos: valor,
        presente: i % 5 === 0,
        mensagem_presente: i % 10 === 0 ? "Parabéns pela formatura!" : null,
        observacoes: i % 7 === 0 ? "Entregar depois das 18h." : null,
        codigo_rastreio: despachado ? `QB${String(123456700 + i)}BR` : null,
        transportadora: despachado ? "Correios" : null,
        expira_em:
          status === "aguardando_pagamento"
            ? new Date(new Date(criadoEm).getTime() + 48 * 3600_000).toISOString()
            : null,
        motivo_cancelamento: status === "cancelado" ? "Reserva vencida sem pagamento." : null,
        created_at: criadoEm,
        itens: [item],
        pagamentos: [],
      });
      i++;
    }
  }
  return lista;
}

export const PEDIDOS_DEMO: PedidoDemo[] = construirPedidos();

export type ClienteDemo = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  origem: "site" | "manual";
  created_at: string;
  observacoes: string | null;
};

/* Um cliente por pedido seria irreal: nem todo comprador cria conta, e o painel
 * precisa mostrar as duas origens convivendo. */
export const CLIENTES_DEMO: ClienteDemo[] = PEDIDOS_DEMO.slice(0, 22).map((pedido, i) => ({
  id: `cliente-demo-${i}`,
  nome: pedido.nome,
  email: pedido.email,
  telefone: i % 3 === 0 ? "(31) 9 8888-0000" : null,
  cidade: pedido.cidade,
  uf: pedido.uf,
  origem: i % 3 === 0 ? "manual" : "site",
  created_at: pedido.created_at,
  observacoes: i % 3 === 0 ? "Cadastrada no balcão da loja." : null,
}));

export const CUPONS_DEMO: CupomAdmin[] = [
  {
    codigo: "BEMVINDO10",
    descricao: "10% na primeira compra",
    tipo: "percentual",
    valor: 10,
    minimo_centavos: 0,
    validade_ate: null,
    limite_usos: null,
    usos: 4,
    ativo: true,
    so_primeira_compra: true,
    um_por_cliente: true,
    created_at: "2026-08-14T12:00:00.000Z",
  },
  {
    codigo: "FORMATURA150",
    descricao: "R$ 150 em anéis de formatura acima de R$ 2.000",
    tipo: "valor",
    valor: 15000,
    minimo_centavos: 200000,
    validade_ate: "2026-12-31",
    limite_usos: 50,
    usos: 0,
    ativo: false,
    so_primeira_compra: false,
    um_por_cliente: true,
    created_at: "2026-09-01T12:00:00.000Z",
  },
];
