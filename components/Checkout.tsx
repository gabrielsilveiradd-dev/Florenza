"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Loader2 } from "lucide-react";
import { ListaDoCarrinho, ResumoDoCarrinho } from "@/components/ui/interactive-checkout";
import { ConfirmacaoDoPedido, type PedidoConfirmado } from "@/components/pedido/ConfirmacaoDoPedido";
import { useCarrinho } from "@/lib/carrinho";
import { createClient } from "@/lib/supabase/client";
import { UFS } from "@/lib/geo/ufs";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatar = (centavos: number) => moeda.format(centavos / 100);

/**
 * Carrinho e fechamento do pedido.
 *
 * O CEP não é burocracia: é dele que sai a UF, e é a UF que acende o mapa do
 * painel. Um pedido sem estado entra no faturamento e some da distribuição por
 * região — a pergunta que o painel existe para responder.
 *
 * Não há cobrança aqui. O pedido nasce em 'aguardando_pagamento' e o acerto é
 * por WhatsApp. Quando o Mercado Pago entrar, é ele que promove o status.
 */
export type ContaDoComprador = {
  nome: string;
  telefone: string;
  email: string;
  cep: string;
  cidade: string;
  uf: string;
};

export function Checkout({ demo, conta }: { demo: boolean; conta: ContaDoComprador | null }) {
  const { itens, totalCentavos, mudarQuantidade, remover, esvaziar, sincronizarEstoque, pronto } =
    useCarrinho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<PedidoConfirmado | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  /* Endereço começa no que a conta guarda, e é a única parte editável aqui.
   *
   * Nome, telefone e e-mail vêm da conta e não se mexe nesta tela. Não é
   * capricho: são os campos pelos quais a Florenza reconhece o cliente e junta
   * os pedidos dele. Deixá-los editáveis no checkout produz o mesmo cliente com
   * três grafias de nome e dois telefones, e ninguém percebe até a aba Clientes
   * virar uma lista de quase-duplicatas. Quem quiser corrigir vai a /conta, que
   * é onde o dado mora.
   *
   * Endereço é o contrário: muda a cada pedido — casa, trabalho, presente para
   * a mãe. É por isso que ele é o campo livre. */
  const [cep, setCep] = useState(conta?.cep ?? "");
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

  const subtotalCentavos = totalCentavos;
  /* Carrinho vazio (ou todo esgotado) não tem desconto a aplicar. Isto é
   * derivado, e não um `setCupom(null)` dentro de um efeito: zerar estado em
   * efeito provoca um segundo render só para desfazer o primeiro, e o código
   * fica com duas fontes de verdade para a mesma pergunta. */
  const cupomAtivo = subtotalCentavos > 0 ? cupom : null;
  const descontoCentavos = cupomAtivo?.desconto ?? 0;
  const totalAPagar = Math.max(0, subtotalCentavos - descontoCentavos);
  const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);

  /* O carrinho vive no localStorage e pode ter semanas: a aba fica aberta, a
   * pessoa volta depois, e nesse meio-tempo a peça pode ter acabado. Ao abrir o
   * carrinho, o estoque é relido do banco e a quantidade é aparada.
   *
   * Isso não substitui a conferência de `criar_pedido` — entre esta leitura e o
   * clique em "Fechar pedido" ainda cabe outra pessoa comprando. Serve para a
   * pessoa descobrir o problema aqui, e não depois de digitar o endereço.
   *
   * A dependência é a lista de SKUs em texto, e não `itens`: `itens` muda de
   * referência a cada alteração do carrinho e o efeito rodaria em laço. */
  const skusNoCarrinho = itens.map((i) => i.sku).sort().join(",");
  useEffect(() => {
    if (demo || !pronto || skusNoCarrinho === "") return;
    let ativo = true;

    (async () => {
      const { data, error } = await createClient()
        .from("produtos")
        .select("sku, estoque")
        .in("sku", skusNoCarrinho.split(","))
        .eq("ativo", true);

      // Falhou a rede: melhor manter o que está na tela do que zerar tudo e
      // assustar. `criar_pedido` continua sendo a rede de segurança.
      if (!ativo || error || !data) return;
      sincronizarEstoque(
        Object.fromEntries(data.map((p) => [p.sku as string, p.estoque as number]))
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

  /** ViaCEP: preenche cidade e estado sozinho, para ninguém digitar errado. */
  async function consultarCep(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = await resposta.json();
      if (!dados.erro) {
        setCidade(dados.localidade ?? "");
        setUf(dados.uf ?? "");
      }
    } catch {
      // CEP é conveniência: se o ViaCEP não responder, os campos continuam
      // editáveis à mão e o pedido segue.
    } finally {
      setBuscandoCep(false);
    }
  }

  async function fechar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo || itens.length === 0) return;
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    setEnviando(true);

    /* Uma chamada só, e é o banco que decide tudo.
     *
     * Repare no que NÃO é mandado: preço, total e valor de desconto.
     * `criar_pedido` copia o preço de `produtos` e resolve o cupom pelo código.
     * Mandar daqui era deixar o valor da joia na mão de quem abrisse o
     * DevTools. O estoque também é conferido lá, com a linha do produto
     * travada — o limite do carrinho é aviso; a palavra final é esta. */
    const { data, error } = await createClient().rpc("criar_pedido", {
      p_itens: itens
        .filter((i) => i.quantidade > 0)
        .map((i) => ({ sku: i.sku, quantidade: i.quantidade })),
      // Logado, a identidade vem da conta e não do formulário — o campo nem
      // existe na tela nesse caso.
      p_nome: (conta?.nome || String(dados.get("nome") ?? "")).trim(),
      p_telefone: (conta?.telefone || String(dados.get("telefone") ?? "")).trim() || null,
      p_email: (conta?.email || String(dados.get("email") ?? "")).trim() || null,
      p_cep: cep.trim() || null,
      p_cidade: cidade || null,
      p_uf: uf || null,
      p_observacoes: String(dados.get("observacoes") ?? "").trim() || null,
      p_cupom: cupomAtivo?.codigo ?? null,
      p_presente: presente,
      p_mensagem_presente: presente ? mensagemPresente.trim() || null : null,
    });
    setEnviando(false);

    if (error) {
      // P0001 é o código das mensagens escritas na própria função — já em
      // português e já falando de peça e quantidade ("Restam 2 unidade(s) de
      // Anel Safira Oval."). Repassar é melhor que traduzir de novo e pior.
      setErro(
        error.code === "P0001"
          ? error.message
          : "Não foi possível registrar o pedido. Tente de novo em instantes."
      );
      return;
    }

    const pedido = Array.isArray(data) ? data[0] : data;
    if (!pedido) {
      setErro("Não foi possível registrar o pedido. Tente de novo em instantes.");
      return;
    }

    // A confirmação guarda uma cópia do carrinho porque o próximo passo o
    // esvazia — e a tela continua na frente da pessoa depois disso.
    setConfirmado({
      numero: pedido.pedido_numero,
      itens: itens.filter((i) => i.quantidade > 0).map((i) => ({
        sku: i.sku,
        nome: i.nome,
        precoCentavos: i.precoCentavos,
        quantidade: i.quantidade,
      })),
      subtotalCentavos,
      descontoCentavos,
      totalCentavos: totalAPagar,
      cupomCodigo: cupomAtivo?.codigo ?? null,
      criadoEm: new Date().toISOString(),
    });
    esvaziar();
  }

  if (confirmado) return <ConfirmacaoDoPedido pedido={confirmado} />;

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

  return (
    <div className="chk__grade">
      <div className="chk__coluna">
        <ListaDoCarrinho itens={itens} mudarQuantidade={mudarQuantidade} remover={remover} />

        <form className="checkout" onSubmit={fechar} id="form-pedido">
          <p className="chk__eyebrow" style={{ marginTop: 34 }}>Seus dados</p>
          <h2 className="chk__titulo" style={{ fontSize: 26, marginTop: 8, marginBottom: 20 }}>
            Para onde vai a peça
          </h2>

          {demo && (
            <div className="chk-erro" style={{ borderColor: "var(--gold-line)", background: "rgba(227,198,146,.22)", color: "var(--ink)" }}>
              O Supabase não está conectado nesta cópia, então o pedido não pode ser registrado.
            </div>
          )}

          {conta && (
            <div className="chk-identidade">
              <div>
                <p className="chk-identidade__rotulo">Comprando como</p>
                <p className="chk-identidade__nome">{conta.nome || conta.email}</p>
                <p className="chk-identidade__linha">
                  {conta.email}
                  {conta.telefone && ` · ${conta.telefone}`}
                </p>
              </div>
              <Link className="chk-identidade__editar" href="/conta">
                Alterar
              </Link>
            </div>
          )}

          <div className="checkout__grade">
            {/* Sem conta, a identidade é digitada aqui mesmo. Com conta, estes
                três campos não existem — ver o comentário no estado do
                endereço, lá em cima. */}
            {!conta && (
              <>
                <div className="checkout__campo">
                  <label className="checkout__rotulo" htmlFor="ck-nome">Nome completo</label>
                  <input className="checkout__input" id="ck-nome" name="nome" required placeholder="Seu nome" />
                </div>
                <div className="checkout__campo">
                  <label className="checkout__rotulo" htmlFor="ck-tel">WhatsApp</label>
                  <input className="checkout__input" id="ck-tel" name="telefone" type="tel" required placeholder="(00) 00000-0000" />
                </div>
                <div className="checkout__campo checkout__campo--largo">
                  <label className="checkout__rotulo" htmlFor="ck-email">E-mail</label>
                  <input className="checkout__input" id="ck-email" name="email" type="email" required placeholder="voce@exemplo.com" />
                </div>
              </>
            )}

            <div className="checkout__campo">
              <label className="checkout__rotulo" htmlFor="ck-cep">CEP</label>
              <input
                className="checkout__input"
                id="ck-cep"
                name="cep"
                inputMode="numeric"
                required
                placeholder="00000-000"
                value={cep}
                onChange={(e) => { setCep(e.target.value); consultarCep(e.target.value); }}
              />
              <span className="checkout__dica">
                {buscandoCep ? "Buscando endereço…" : "Preenche cidade e estado automaticamente."}
              </span>
            </div>
            <div className="checkout__campo">
              <label className="checkout__rotulo" htmlFor="ck-cidade">Cidade</label>
              <input
                className="checkout__input"
                id="ck-cidade"
                required
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Cidade"
              />
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
              <label className="checkout__rotulo" htmlFor="ck-obs">Observações</label>
              <input className="checkout__input" id="ck-obs" name="observacoes" placeholder="Tamanho do aro, gravação, prazo… (opcional)" />
            </div>
          </div>

          {/* Presente é pergunta de joalheria, não enfeite: boa parte das peças
              é comprada para outra pessoa, e isso muda o que vai na caixa. */}
          <div className={`chk-presente${presente ? " is-ativo" : ""}`}>
            <label className="chk-presente__troca">
              <input
                type="checkbox"
                checked={presente}
                onChange={(e) => setPresente(e.target.checked)}
              />
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
                <label className="checkout__rotulo" htmlFor="ck-msg">
                  Mensagem do cartão (opcional)
                </label>
                <textarea
                  className="checkout__input"
                  id="ck-msg"
                  rows={3}
                  maxLength={240}
                  value={mensagemPresente}
                  onChange={(e) => setMensagemPresente(e.target.value)}
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
      </div>

      <ResumoDoCarrinho
        quantidadeTotal={quantidadeTotal}
        subtotalCentavos={subtotalCentavos}
        descontoCentavos={descontoCentavos}
        totalCentavos={totalAPagar}
        cupom={cupomAtivo}
      >
        <div className="chk-cupom">
          <label className="chk-cupom__rotulo" htmlFor="ck-cupom">Cupom de desconto</label>
          <div className="chk-cupom__linha">
            <input
              className="chk-cupom__campo"
              id="ck-cupom"
              value={codigoDigitado}
              onChange={(e) => { setCodigoDigitado(e.target.value); setErroCupom(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarCupom(); } }}
              placeholder="Tem um código?"
              autoComplete="off"
            />
            <button
              type="button"
              className="chk-cupom__botao"
              onClick={aplicarCupom}
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

        {/* O botão vive no resumo, mas envia o formulário da outra coluna — é
            para isso que `form=` existe. Duplicar o botão dentro do formulário
            daria dois caminhos para a mesma ação. */}
        <button
          className="chk-fechar"
          type="submit"
          form="form-pedido"
          disabled={enviando || demo || subtotalCentavos === 0}
        >
          {enviando && <Loader2 aria-hidden size={15} className="animate-spin" />}
          Fechar pedido · {formatar(totalAPagar)}
        </button>

        {subtotalCentavos === 0 ? (
          <p className="chk-nota">
            As peças do seu carrinho estão sem unidades. Remova-as ou fale com a Florenza para
            encomendar.
          </p>
        ) : (
          <p className="chk-nota">
            Nenhum pagamento acontece agora. O pedido chega para a Florenza, que entra em
            contato pelo WhatsApp para combinar a forma de pagamento e o prazo.
          </p>
        )}
      </ResumoDoCarrinho>
    </div>
  );
}
