"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Loader2, LogIn } from "lucide-react";
import { ListaDoCarrinho, ResumoDoCarrinho } from "@/components/ui/interactive-checkout";
import { ConfirmacaoDoPedido, type PedidoConfirmado } from "@/components/pedido/ConfirmacaoDoPedido";
import { faltaMedida } from "@/lib/aros";
import { chaveDoItem, useCarrinho } from "@/lib/carrinho";
import { buscarCep, cpfValido, formatarCep, formatarCpf } from "@/lib/documentos";
import { cotarFrete, descreverPrazo, valorDoFrete, type OpcaoDeFrete } from "@/lib/frete";
import { RESERVA_HORAS } from "@/lib/loja";
import { createClient } from "@/lib/supabase/client";
import { UFS } from "@/lib/geo/ufs";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatar = (centavos: number) => moeda.format(centavos / 100);

/**
 * Carrinho e fechamento do pedido.
 *
 * COMPRA SÓ COM CONTA. Quem não entrou vê o carrinho, mas no lugar do
 * formulário recebe o convite para entrar — a decisão é do dono da loja, e o
 * banco a garante: `criar_pedido()` não atende visitante.
 *
 * O endereço é completo porque é para ele que a peça vai, e o CEP continua
 * sendo o que acende o mapa do painel (é dele que sai a UF). É também dele que
 * sai o FRETE: o banco cota pelo CEP, a pessoa escolhe a modalidade, e só a
 * modalidade vai para o servidor — o valor, `criar_pedido()` procura de novo.
 *
 * MEDIDA: peça com aro não fecha sem a medida escolhida. A tela avisa antes; o
 * banco recusa de qualquer jeito.
 *
 * O pagamento depende do que estiver ligado. Com o Mercado Pago configurado, o
 * fechamento leva direto para a página de pagamento; sem ele, o pedido nasce
 * em 'aguardando_pagamento' e o acerto é por WhatsApp. Em qualquer caso as
 * peças ficam reservadas por 48 horas.
 */
export type ContaDoComprador = {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  cep: string;
  logradouro: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type Cotacao = { cep: string; opcoes: OpcaoDeFrete[] } | { cep: string; erro: string };

export function Checkout({
  demo,
  conta,
  pagamentoOnline,
}: {
  demo: boolean;
  conta: ContaDoComprador | null;
  pagamentoOnline: boolean;
}) {
  const {
    itens, totalCentavos, mudarQuantidade, mudarMedida, remover, esvaziar,
    sincronizarEstoque, quantidadeDaPeca, pronto,
  } = useCarrinho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<PedidoConfirmado | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  /* Identidade: vem da conta e não se mexe nesta tela.
   *
   * São os campos pelos quais a Florenza reconhece o cliente e junta os pedidos
   * dele. Editáveis no checkout, produzem o mesmo cliente com três grafias de
   * nome e dois telefones. A exceção é o que a conta AINDA NÃO TEM — na primeira
   * compra o formulário pede, e o banco grava na conta. */
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");

  /* Endereço é o contrário: muda a cada pedido — casa, trabalho, presente para
   * a mãe. Começa no que a conta guarda e é todo editável. */
  const [cep, setCep] = useState(formatarCep(conta?.cep ?? ""));
  const [logradouro, setLogradouro] = useState(conta?.logradouro ?? "");
  const [enderecoNumero, setEnderecoNumero] = useState(conta?.enderecoNumero ?? "");
  const [complemento, setComplemento] = useState(conta?.complemento ?? "");
  const [bairro, setBairro] = useState(conta?.bairro ?? "");
  const [cidade, setCidade] = useState(conta?.cidade ?? "");
  const [uf, setUf] = useState(conta?.uf ?? "");

  const [presente, setPresente] = useState(false);
  const [mensagemPresente, setMensagemPresente] = useState("");

  // O código digitado e o que foi de fato aceito são coisas diferentes: a
  // pessoa pode estar no meio de digitar outro código com um cupom já aplicado.
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [codigoAplicado, setCodigoAplicado] = useState<string | null>(null);
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number } | null>(null);
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [conferindoCupom, setConferindoCupom] = useState(false);

  /* Frete. A cotação fica guardada junto com o CEP a que responde: trocar o CEP
   * deixa a cotação velha de lado sozinho, sem efeito para limpá-la — mesmo
   * cuidado do cupom derivado logo abaixo. */
  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [modalidade, setModalidade] = useState<string | null>(null);

  const subtotalCentavos = totalCentavos;
  /* Carrinho vazio (ou todo esgotado) não tem desconto a aplicar. Isto é
   * derivado, e não um `setCupom(null)` dentro de um efeito: zerar estado em
   * efeito provoca um segundo render só para desfazer o primeiro, e o código
   * fica com duas fontes de verdade para a mesma pergunta. */
  const cupomAtivo = subtotalCentavos > 0 ? cupom : null;
  const descontoCentavos = cupomAtivo?.desconto ?? 0;

  const cepDigitos = cep.replace(/\D/g, "");
  const cotacaoAtual = cotacao?.cep === cepDigitos ? cotacao : null;
  const opcoesDeFrete = cotacaoAtual && "opcoes" in cotacaoAtual ? cotacaoAtual.opcoes : [];
  // Sem escolha feita, vale a primeira — a mais em conta, na ordem do banco.
  const frete = opcoesDeFrete.find((o) => o.modalidade === modalidade) ?? opcoesDeFrete[0] ?? null;

  // O cupom desconta as peças; o frete entra depois, inteiro — como no banco.
  const totalAPagar = Math.max(0, subtotalCentavos - descontoCentavos) + (frete?.precoCentavos ?? 0);
  const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);
  const medidaPendente = itens.some((i) => i.quantidade > 0 && faltaMedida(i));

  /* O carrinho vive no localStorage e pode ter semanas: a aba fica aberta, a
   * pessoa volta depois, e nesse meio-tempo a peça pode ter acabado. Ao abrir o
   * carrinho, estoque e número de aros são relidos do banco e a quantidade é
   * aparada.
   *
   * Isso não substitui a conferência de `criar_pedido` — entre esta leitura e o
   * clique em "Fechar pedido" ainda cabe outra pessoa comprando. Serve para a
   * pessoa descobrir o problema aqui, e não depois de digitar o endereço.
   *
   * A dependência é a lista de SKUs em texto, e não `itens`: `itens` muda de
   * referência a cada alteração do carrinho e o efeito rodaria em laço. */
  const skusNoCarrinho = [...new Set(itens.map((i) => i.sku))].sort().join(",");
  useEffect(() => {
    if (demo || !pronto || skusNoCarrinho === "") return;
    let ativo = true;

    (async () => {
      const { data, error } = await createClient()
        .from("produtos")
        .select("sku, estoque, aros")
        .in("sku", skusNoCarrinho.split(","))
        .eq("ativo", true);

      // Falhou a rede: melhor manter o que está na tela do que zerar tudo e
      // assustar. `criar_pedido` continua sendo a rede de segurança.
      if (!ativo || error || !data) return;
      sincronizarEstoque(
        Object.fromEntries(
          data.map((p) => [p.sku as string, { estoque: p.estoque as number, aros: p.aros as number }])
        )
      );
    })();

    return () => { ativo = false; };
  }, [skusNoCarrinho, pronto, demo, sincronizarEstoque]);

  /* Um caminho só para o cupom: o botão apenas anota QUAL código vale, e este
   * efeito faz a pergunta ao banco — tudo depois do `await`.
   *
   * Reconferir a cada mudança de subtotal não é zelo excessivo: cupom
   * percentual muda de valor com o carrinho. Quem aplicasse 10% sobre R$ 2.420
   * e depois tirasse a peça veria R$ 242 de desconto sobre um subtotal menor, e
   * só descobriria ao fechar, com o endereço já digitado.
   *
   * O desconto NUNCA é calculado aqui. `criar_pedido` recalcula do zero. */
  useEffect(() => {
    if (!codigoAplicado || subtotalCentavos <= 0) return;
    let ativo = true;

    (async () => {
      const { data, error } = await createClient().rpc("conferir_cupom", {
        p_codigo: codigoAplicado,
        p_subtotal: subtotalCentavos,
      });
      if (!ativo) return;

      const resposta = Array.isArray(data) ? data[0] : data;
      setConferindoCupom(false);

      if (error || !resposta) {
        setErroCupom("Não foi possível conferir o cupom agora.");
        return;
      }
      if (!resposta.valido) {
        setCupom(null);
        setErroCupom(resposta.motivo);
        return;
      }
      setErroCupom(null);
      setCupom({ codigo: codigoAplicado, desconto: resposta.desconto_centavos });
    })();

    return () => { ativo = false; };
  }, [codigoAplicado, subtotalCentavos]);

  /* Cotação a cada CEP completo. O estado do formulário vai junto só como
   * reserva: o banco tira a região do próprio CEP e usa o estado apenas se não
   * reconhecer a faixa. Quando o ViaCEP preenche o estado, a cotação roda de
   * novo — a primeira resposta, se chegar depois, é descartada pelo `ativo`. */
  useEffect(() => {
    if (demo || cepDigitos.length !== 8) return;
    let ativo = true;

    (async () => {
      const resposta = await cotarFrete(cepDigitos, uf);
      if (!ativo) return;
      setCotacao(
        "erro" in resposta
          ? { cep: cepDigitos, erro: resposta.erro }
          : { cep: cepDigitos, opcoes: resposta.opcoes }
      );
    })();

    return () => { ativo = false; };
  }, [cepDigitos, uf, demo]);

  function aplicarCupom() {
    const limpo = codigoDigitado.trim().toUpperCase();
    if (!limpo) return;
    setErroCupom(null);
    setConferindoCupom(true);
    setCodigoAplicado(limpo);
  }

  function tirarCupom() {
    setCodigoAplicado(null);
    setCupom(null);
    setCodigoDigitado("");
    setErroCupom(null);
  }

  /** ViaCEP preenche rua, bairro, cidade e estado — o número é sempre da pessoa. */
  async function aoMudarCep(valor: string) {
    setCep(formatarCep(valor));
    if (valor.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    const endereco = await buscarCep(valor);
    setBuscandoCep(false);
    if (!endereco) return;
    // CEP geral de cidade pequena não traz rua: aí o que a pessoa digitou fica.
    if (endereco.logradouro) setLogradouro(endereco.logradouro);
    if (endereco.bairro) setBairro(endereco.bairro);
    setCidade(endereco.cidade);
    setUf(endereco.uf);
  }

  async function fechar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo || !conta || itens.length === 0) return;
    setErro(null);

    // Cortesias antes da ida ao servidor; quem decide é o banco.
    if (!conta.cpf && !cpfValido(cpf)) {
      setErro("Confira o CPF: os dígitos não batem.");
      return;
    }
    if (medidaPendente) {
      setErro("Escolha a medida do aro de todas as peças antes de fechar o pedido.");
      return;
    }
    if (!frete) {
      setErro(cepDigitos.length === 8 ? "Escolha a forma de envio." : "Informe o CEP para calcular o frete.");
      return;
    }

    const dados = new FormData(evento.currentTarget);
    const linhas = itens.filter((i) => i.quantidade > 0);
    setEnviando(true);

    /* Repare no que NÃO é mandado: preço, frete, total e valor de desconto. O
     * servidor repassa para `criar_pedido`, que copia o preço de `produtos`, o
     * frete de `fretes` pela modalidade, e resolve o cupom pelo código. O
     * estoque também é conferido lá, com a linha do produto travada — o limite
     * do carrinho é aviso; a palavra final é esta. */
    const resposta = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: linhas.map((i) => ({
          sku: i.sku,
          quantidade: i.quantidade,
          tamanho: i.aros >= 1 ? i.tamanho : null,
          tamanhoPar: i.aros === 2 ? i.tamanhoPar : null,
        })),
        nome: conta.nome ? null : nome,
        telefone: conta.telefone ? null : telefone,
        cpf: conta.cpf ? null : cpf,
        cep, logradouro, enderecoNumero, complemento, bairro, cidade, uf,
        frete: frete.modalidade,
        observacoes: String(dados.get("observacoes") ?? "").trim() || null,
        cupom: cupomAtivo?.codigo ?? null,
        presente,
        mensagemPresente: presente ? mensagemPresente.trim() || null : null,
      }),
    });
    const resultado = await resposta.json().catch(() => null);

    if (!resposta.ok || !resultado?.numero) {
      setEnviando(false);
      setErro(resultado?.erro ?? "Não foi possível registrar o pedido. Tente de novo em instantes.");
      return;
    }

    // O pedido existe e as peças estão reservadas: o carrinho já cumpriu o papel.
    esvaziar();

    if (resultado.pagamentoUrl) {
      // Continua "enviando" de propósito: a tela não pisca antes de sair.
      window.location.assign(resultado.pagamentoUrl);
      return;
    }

    setEnviando(false);
    // A confirmação guarda uma cópia do carrinho porque o passo acima o
    // esvaziou — e a tela continua na frente da pessoa depois disso.
    setConfirmado({
      numero: resultado.numero,
      itens: linhas.map((i) => ({
        chave: chaveDoItem(i),
        nome: i.nome,
        precoCentavos: i.precoCentavos,
        quantidade: i.quantidade,
        aros: i.aros,
        tamanho: i.tamanho,
        tamanhoPar: i.tamanhoPar,
      })),
      subtotalCentavos,
      descontoCentavos,
      // O valor do frete é o que o banco gravou, não o da cotação na tela.
      freteCentavos: resultado.freteCentavos ?? frete.precoCentavos,
      freteNome: frete.nome,
      fretePrazo: descreverPrazo(frete.prazoMinDias, frete.prazoMaxDias),
      totalCentavos: resultado.totalCentavos ?? totalAPagar,
      cupomCodigo: cupomAtivo?.codigo ?? null,
      criadoEm: new Date().toISOString(),
      expiraEm: resultado.expiraEm ?? null,
      erroPagamento: resultado.erroPagamento ?? null,
    });
  }

  if (confirmado) return <ConfirmacaoDoPedido pedido={confirmado} pagamentoOnline={pagamentoOnline} />;

  // Antes de ler o localStorage não dá para saber se o carrinho está vazio;
  // mostrar "vazio" nesse instante faria a mensagem piscar para quem tem itens.
  if (!pronto) return <div style={{ minHeight: 260 }} />;

  if (itens.length === 0) {
    return (
      <div className="chk-vazio">
        <p>Seu carrinho está vazio.</p>
        <Link className="chk-fechar" href="/aneis-formatura" style={{ maxWidth: 240, margin: "22px auto 0" }}>
          Ver as peças
        </Link>
      </div>
    );
  }

  const precisaEntrar = !demo && !conta;

  return (
    <div className="chk__grade">
      <div className="chk__coluna">
        <ListaDoCarrinho
          itens={itens}
          mudarQuantidade={mudarQuantidade}
          mudarMedida={mudarMedida}
          remover={remover}
          quantidadeDaPeca={quantidadeDaPeca}
        />

        {precisaEntrar ? (
          <div className="chk-entrar">
            <p className="chk__eyebrow">Para fechar o pedido</p>
            <h2 className="chk-entrar__titulo">Entre na sua conta</h2>
            <p className="chk-nota">
              As compras são feitas com conta: é nela que você acompanha o pagamento, o preparo e o
              envio da peça. Seu carrinho continua aqui depois de entrar.
            </p>
            <div className="ped-acoes" style={{ marginTop: 18 }}>
              <Link className="ped-acao ped-acao--principal" href="/entrar?redirect=%2Fcarrinho">
                <LogIn aria-hidden size={14} />
                Entrar ou criar conta
              </Link>
            </div>
          </div>
        ) : (
          <form className="checkout" onSubmit={fechar} id="form-pedido">
            {demo && (
              <div className="chk-erro" style={{ borderColor: "var(--gold-line)", background: "rgba(229, 211, 166,.22)", color: "var(--ink)" }}>
                O Supabase não está conectado nesta cópia, então o pedido não pode ser registrado.
              </div>
            )}

            {/* Sem conta (só no modo demonstração) não há dado nenhum a mostrar,
                e o título sozinho parecia seção quebrada. */}
            {conta && <p className="chk__eyebrow">Seus dados</p>}

            {conta && (
              <div className="chk-identidade" style={{ marginTop: 14 }}>
                <div>
                  <p className="chk-identidade__rotulo">Comprando como</p>
                  <p className="chk-identidade__nome">{conta.nome || conta.email}</p>
                  <p className="chk-identidade__linha">
                    {conta.email}
                    {conta.telefone && ` · ${conta.telefone}`}
                    {conta.cpf && ` · CPF ${formatarCpf(conta.cpf)}`}
                  </p>
                </div>
                <Link className="chk-identidade__editar" href="/conta">
                  Alterar
                </Link>
              </div>
            )}

            {/* Só o que a conta ainda não tem. Preenchido aqui, fica gravado nela. */}
            {conta && (!conta.nome || !conta.telefone || !conta.cpf) && (
              <div className="checkout__grade" style={{ marginTop: 0, marginBottom: 8 }}>
                {!conta.nome && (
                  <div className="checkout__campo checkout__campo--largo">
                    <label className="checkout__rotulo" htmlFor="ck-nome">Nome completo</label>
                    <input className="checkout__input" id="ck-nome" required autoComplete="name"
                      value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
                  </div>
                )}
                {!conta.telefone && (
                  <div className="checkout__campo">
                    <label className="checkout__rotulo" htmlFor="ck-tel">WhatsApp</label>
                    <input className="checkout__input" id="ck-tel" type="tel" required autoComplete="tel"
                      value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                )}
                {!conta.cpf && (
                  <div className="checkout__campo">
                    <label className="checkout__rotulo" htmlFor="ck-cpf">CPF</label>
                    <input className="checkout__input" id="ck-cpf" inputMode="numeric" required
                      value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" />
                    <span className="checkout__dica">Vai na nota fiscal e na etiqueta de envio.</span>
                  </div>
                )}
              </div>
            )}

            <p className="chk__eyebrow" style={{ marginTop: 30 }}>Entrega</p>
            <h2 className="chk__titulo" style={{ fontSize: 26, marginTop: 8 }}>
              Para onde vai a peça
            </h2>

            <div className="checkout__grade">
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-cep">CEP</label>
                <input
                  className="checkout__input" id="ck-cep" inputMode="numeric" required autoComplete="postal-code"
                  placeholder="00000-000" value={cep} onChange={(e) => aoMudarCep(e.target.value)}
                />
                <span className="checkout__dica">
                  {buscandoCep ? "Buscando endereço…" : "Preenche rua, bairro, cidade e estado."}
                </span>
              </div>
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-uf">Estado</label>
                <select className="checkout__input" id="ck-uf" required value={uf} onChange={(e) => setUf(e.target.value)}>
                  <option value="">Selecione</option>
                  {UFS.map((u) => (
                    <option key={u.uf} value={u.uf}>{u.nome}</option>
                  ))}
                </select>
              </div>
              <div className="checkout__campo checkout__campo--largo">
                <label className="checkout__rotulo" htmlFor="ck-rua">Rua</label>
                <input className="checkout__input" id="ck-rua" required autoComplete="address-line1"
                  value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua, avenida…" />
              </div>
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-numero">Número</label>
                <input className="checkout__input" id="ck-numero" required
                  value={enderecoNumero} onChange={(e) => setEnderecoNumero(e.target.value)} placeholder="123" />
              </div>
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-complemento">Complemento</label>
                <input className="checkout__input" id="ck-complemento" autoComplete="address-line2"
                  value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Apto, bloco (opcional)" />
              </div>
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-bairro">Bairro</label>
                <input className="checkout__input" id="ck-bairro" required
                  value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
              </div>
              <div className="checkout__campo">
                <label className="checkout__rotulo" htmlFor="ck-cidade">Cidade</label>
                <input className="checkout__input" id="ck-cidade" required autoComplete="address-level2"
                  value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
              </div>
              <div className="checkout__campo checkout__campo--largo">
                <label className="checkout__rotulo" htmlFor="ck-obs">Observações</label>
                <input className="checkout__input" id="ck-obs" name="observacoes"
                  placeholder="Gravação, ponto de referência… (opcional)" />
              </div>
            </div>

            {/* Depois do endereço, porque é do CEP que o frete sai. */}
            <fieldset className="chk-frete">
              <legend className="checkout__rotulo">Forma de envio</legend>
              {demo ? (
                <p className="checkout__dica">
                  O frete é calculado pelo banco, e o Supabase não está conectado nesta cópia.
                </p>
              ) : cepDigitos.length !== 8 ? (
                <p className="checkout__dica">Informe o CEP para ver as formas de envio.</p>
              ) : !cotacaoAtual ? (
                <p className="checkout__dica chk-frete__calculando">
                  <Loader2 aria-hidden size={13} className="animate-spin" />
                  Calculando o frete…
                </p>
              ) : "erro" in cotacaoAtual ? (
                <p className="chk-cupom__erro" role="alert">{cotacaoAtual.erro}</p>
              ) : (
                <div className="chk-frete__opcoes">
                  {opcoesDeFrete.map((o) => {
                    const escolhida = frete?.modalidade === o.modalidade;
                    return (
                      <label key={o.modalidade} className={`chk-frete__opcao${escolhida ? " is-ativo" : ""}`}>
                        <input
                          type="radio" name="frete" value={o.modalidade}
                          checked={escolhida} onChange={() => setModalidade(o.modalidade)}
                        />
                        <span className="chk-frete__texto">
                          <span className="chk-frete__nome">{o.nome}</span>
                          <span className="chk-frete__prazo">
                            Chega em {descreverPrazo(o.prazoMinDias, o.prazoMaxDias)} depois da postagem
                          </span>
                        </span>
                        <span className="chk-frete__preco">{valorDoFrete(o.precoCentavos)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            {/* Presente é pergunta de joalheria, não enfeite: boa parte das peças
                é comprada para outra pessoa, e isso muda o que vai na caixa. */}
            <div className={`chk-presente${presente ? " is-ativo" : ""}`}>
              <label className="chk-presente__troca">
                <input type="checkbox" checked={presente} onChange={(e) => setPresente(e.target.checked)} />
                <Gift aria-hidden size={16} />
                <span>
                  <strong>É para presente</strong>
                  <span className="chk-presente__dica">
                    A peça vai em embalagem de presente e <strong>sem nenhum valor impresso</strong>.
                  </span>
                </span>
              </label>

              {presente && (
                <div className="chk-presente__mensagem">
                  <label className="checkout__rotulo" htmlFor="ck-msg">Mensagem do cartão (opcional)</label>
                  <textarea
                    className="checkout__input" id="ck-msg" rows={3} maxLength={240}
                    value={mensagemPresente} onChange={(e) => setMensagemPresente(e.target.value)}
                    placeholder="O que escrevemos no cartão que vai junto"
                  />
                  <span className="checkout__dica">
                    {mensagemPresente.length}/240 · escrito à mão no cartão da caixa
                  </span>
                </div>
              )}
            </div>

            {erro && <p className="chk-erro" role="alert">{erro}</p>}
          </form>
        )}
      </div>

      <ResumoDoCarrinho
        quantidadeTotal={quantidadeTotal}
        subtotalCentavos={subtotalCentavos}
        descontoCentavos={descontoCentavos}
        frete={
          frete
            ? { nome: frete.nome, centavos: frete.precoCentavos }
            : { pendente: precisaEntrar ? "calculado no fechamento" : cepDigitos.length === 8 ? "a calcular" : "informe o CEP" }
        }
        totalCentavos={totalAPagar}
        cupom={cupomAtivo}
      >
        {!precisaEntrar && (
          <div className="chk-cupom">
            <label className="chk-cupom__rotulo" htmlFor="ck-cupom">Cupom de desconto</label>
            <div className="chk-cupom__linha">
              <input
                className="chk-cupom__campo" id="ck-cupom" value={codigoDigitado}
                onChange={(e) => { setCodigoDigitado(e.target.value); setErroCupom(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarCupom(); } }}
                placeholder="Tem um código?" autoComplete="off"
              />
              <button
                type="button" className="chk-cupom__botao" onClick={aplicarCupom}
                disabled={conferindoCupom || demo || codigoDigitado.trim() === ""}
              >
                {conferindoCupom ? <Loader2 aria-hidden size={13} className="animate-spin" /> : "Aplicar"}
              </button>
            </div>
            {erroCupom && <p className="chk-cupom__erro" role="alert">{erroCupom}</p>}
            {cupomAtivo && (
              <button type="button" className="chk-cupom__tirar" onClick={tirarCupom}>
                remover cupom
              </button>
            )}
          </div>
        )}

        {precisaEntrar ? (
          <Link className="chk-fechar" href="/entrar?redirect=%2Fcarrinho">
            Entrar para fechar o pedido
          </Link>
        ) : (
          /* O botão vive no resumo, mas envia o formulário da outra coluna — é
             para isso que `form=` existe. Duplicar o botão dentro do formulário
             daria dois caminhos para a mesma ação. */
          <button
            className="chk-fechar" type="submit" form="form-pedido"
            disabled={enviando || demo || subtotalCentavos === 0}
          >
            {enviando && <Loader2 aria-hidden size={15} className="animate-spin" />}
            {pagamentoOnline ? "Ir para o pagamento" : "Fechar pedido"} · {formatar(totalAPagar)}
          </button>
        )}

        {medidaPendente && !precisaEntrar && (
          <p className="chk-nota chk-nota--alerta">
            Falta escolher a medida do aro de uma peça — o seletor fica na linha dela.
          </p>
        )}

        {subtotalCentavos === 0 ? (
          <p className="chk-nota">
            As peças do seu carrinho estão sem unidades. Remova-as ou fale com a Florenza para saber
            do próximo lote.
          </p>
        ) : pagamentoOnline ? (
          <p className="chk-nota">
            Depois de fechar, você paga com Pix ou cartão na página do Mercado Pago. As peças ficam
            reservadas para você por {RESERVA_HORAS} horas.
          </p>
        ) : (
          <p className="chk-nota">
            Nenhum pagamento acontece agora. A Florenza fala com você pelo WhatsApp para combinar o
            pagamento, e as peças ficam reservadas por {RESERVA_HORAS} horas.
          </p>
        )}

        {/* O resumo do contrato antes de concluir, como pede a lei do comércio
            eletrônico: as condições estão a um clique, não escondidas. */}
        <p className="chk-nota">
          Ao fechar o pedido você concorda com os <Link href="/termos-de-compra">termos de compra</Link> e
          a <Link href="/trocas-e-devolucoes">política de trocas</Link>.
        </p>
      </ResumoDoCarrinho>
    </div>
  );
}
