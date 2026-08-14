"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
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
export function Checkout({ demo }: { demo: boolean }) {
  const { itens, totalCentavos, mudarQuantidade, remover, esvaziar, sincronizarEstoque, pronto } =
    useCarrinho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  // O código digitado e o que foi de fato aceito são coisas diferentes: a
  // pessoa pode estar no meio de digitar outro código com um cupom já aplicado.
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [codigoAplicado, setCodigoAplicado] = useState<string | null>(null);
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number; descricao: string | null } | null>(null);
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [conferindoCupom, setConferindoCupom] = useState(false);

  const subtotalCentavos = totalCentavos;
  /* Carrinho vazio (ou todo esgotado) não tem desconto a aplicar. Isto é
   * derivado, e não um `setCupom(null)` dentro de um efeito: zerar estado em
   * efeito provoca um segundo render só para desfazer o primeiro, e o código
   * fica com duas fontes de verdade para a mesma pergunta. Se a pessoa devolver
   * uma peça ao carrinho, o cupom que ela digitou volta a valer sozinho. */
  const cupomAtivo = subtotalCentavos > 0 ? cupom : null;
  const descontoCentavos = cupomAtivo?.desconto ?? 0;
  const totalAPagar = Math.max(0, subtotalCentavos - descontoCentavos);

  /* O carrinho vive no localStorage e pode ter semanas: a aba fica aberta, a
   * pessoa volta depois, e nesse meio-tempo a peça pode ter acabado. Ao abrir o
   * carrinho, o estoque é relido do banco e a quantidade é aparada.
   *
   * Isso não substitui a conferência de `criar_pedido` — entre esta leitura e o
   * clique em "Enviar pedido" ainda cabe outra pessoa comprando. Serve para a
   * pessoa descobrir o problema aqui, olhando a lista, e não depois de digitar
   * o endereço inteiro.
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

    return () => {
      ativo = false;
    };
  }, [skusNoCarrinho, pronto, demo, sincronizarEstoque]);

  /* Um caminho só para o cupom: o botão apenas anota QUAL código vale, e este
   * efeito faz a pergunta ao banco. Duas entradas para a mesma coisa (aplicar e
   * reconferir) davam duas cópias da mesma lógica, e o `setState` síncrono da
   * função compartilhada ainda desrespeitava a regra de não mexer em estado no
   * corpo do efeito. Aqui tudo acontece depois do `await`.
   *
   * Reconferir a cada mudança de subtotal não é zelo excessivo: cupom
   * percentual muda de valor com o carrinho. Quem aplicasse 10% sobre R$ 2.420
   * e depois tirasse a peça ficaria vendo R$ 242 de desconto sobre um subtotal
   * menor — e só descobriria o erro ao fechar, com o endereço já digitado.
   *
   * O desconto NUNCA é calculado aqui. A tela mostra o que o banco respondeu, e
   * `criar_pedido` recalcula do zero na hora de fechar. Este número é para ver
   * antes, não para virar o valor cobrado. */
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
      setCupom({
        codigo: codigoAplicado,
        desconto: resposta.desconto_centavos,
        descricao: resposta.descricao,
      });
    })();

    return () => {
      ativo = false;
    };
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
    const supabase = createClient();

    /* Uma chamada só, e é o banco que decide tudo.
     *
     * Antes eram dois inserts daqui: `pedidos` e depois `pedido_itens`. Se o
     * segundo falhasse sobrava pedido sem peça nenhuma — e a mensagem de erro
     * daquela versão dizia isso com todas as letras. Duas escritas separadas do
     * navegador não são uma transação.
     *
     * Repare no que NÃO é mandado: preço e total. `criar_pedido` copia o preço
     * de `produtos` e a trigger soma. Mandar daqui era deixar o valor da joia na
     * mão de quem abrisse o DevTools.
     *
     * O estoque também é conferido lá dentro, com a linha do produto travada.
     * O limite que o carrinho aplica é aviso; a palavra final é esta. */
    const { data, error } = await supabase.rpc("criar_pedido", {
      p_itens: itens
        .filter((i) => i.quantidade > 0)
        .map((i) => ({ sku: i.sku, quantidade: i.quantidade })),
      p_nome: String(dados.get("nome") ?? "").trim(),
      p_telefone: String(dados.get("telefone") ?? "").trim() || null,
      p_email: String(dados.get("email") ?? "").trim() || null,
      p_cep: String(dados.get("cep") ?? "").trim() || null,
      p_cidade: cidade || null,
      p_uf: uf || null,
      p_observacoes: String(dados.get("observacoes") ?? "").trim() || null,
      // Vai o CÓDIGO, nunca o valor do desconto. Quem calcula é a função, com o
      // subtotal que ela mesma somou do catálogo.
      p_cupom: cupomAtivo?.codigo ?? null,
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

    esvaziar();
    setNumero(pedido.pedido_numero);
  }

  if (numero !== null) {
    return (
      <div className="checkout__confirmado">
        <p className="pdp__eyebrow">Pedido registrado</p>
        <p className="checkout__numero">#{numero}</p>
        <p className="pdp__nota" style={{ margin: "18px auto 0" }}>
          Anote esse número. A Florenza entra em contato para combinar o pagamento e o prazo
          de produção da peça.
        </p>
        <Link className="pdp__comprar" href="/" style={{ marginTop: 28 }}>
          Voltar à vitrine
        </Link>
      </div>
    );
  }

  // Antes de ler o localStorage não dá para saber se o carrinho está vazio;
  // mostrar "vazio" nesse instante faria a mensagem piscar para quem tem itens.
  if (!pronto) return <div style={{ minHeight: 240 }} />;

  if (itens.length === 0) {
    return (
      <div className="carrinho__vazio">
        <p>Seu carrinho está vazio.</p>
        <Link className="pdp__comprar" href="/aneis-formatura" style={{ marginTop: 24 }}>
          Ver as peças
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="carrinho__lista">
        {itens.map((item) => (
          <li className="carrinho__item" key={item.sku}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="carrinho__foto" src={item.imagemUrl} alt="" />
            <div style={{ flexGrow: 1, minWidth: 180 }}>
              <Link href={`/produto/${item.slug}`} className="carrinho__nome">{item.nome}</Link>
              <p className="carrinho__sku">
                Cód. {item.sku}
                {item.estoque <= 0 && " · esgotada, não entra no pedido"}
                {item.estoque > 0 && item.quantidade >= item.estoque &&
                  ` · você levou ${item.estoque === 1 ? "a única" : `todas as ${item.estoque}`}`}
              </p>
            </div>

            <div className="carrinho__qtd">
              <button type="button" aria-label={`Menos um ${item.nome}`} onClick={() => mudarQuantidade(item.sku, item.quantidade - 1)}>
                <Minus aria-hidden size={13} />
              </button>
              <span>{item.quantidade}</span>
              {/* Sem estoque para mais, o botão sai de cena: deixá-lo clicável
                  sem efeito faz a pessoa achar que a página travou. */}
              <button
                type="button"
                aria-label={`Mais um ${item.nome}`}
                disabled={item.quantidade >= item.estoque}
                onClick={() => mudarQuantidade(item.sku, item.quantidade + 1)}
              >
                <Plus aria-hidden size={13} />
              </button>
            </div>

            <span className="carrinho__preco">{formatar(item.precoCentavos * item.quantidade)}</span>

            <button type="button" aria-label={`Remover ${item.nome}`} onClick={() => remover(item.sku)} style={{ color: "var(--ink-dim)" }}>
              <Trash2 aria-hidden size={15} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>

      <section className="carrinho__resumo">
        <div className="carrinho__cupom">
          <label className="checkout__rotulo" htmlFor="ck-cupom">Cupom de desconto</label>
          <div className="carrinho__cupom-linha">
            <input
              className="checkout__input"
              id="ck-cupom"
              value={codigoDigitado}
              onChange={(e) => { setCodigoDigitado(e.target.value); setErroCupom(null); }}
              // Enter dentro do formulário de checkout enviaria o pedido. Aqui o
              // campo está fora dele, mas a tecla continua sendo o gesto natural
              // para "aplicar", então é tratada explicitamente.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aplicarCupom();
                }
              }}
              placeholder="Tem um código?"
              autoComplete="off"
            />
            <button
              type="button"
              className="carrinho__cupom-botao"
              onClick={aplicarCupom}
              disabled={conferindoCupom || demo || codigoDigitado.trim() === ""}
            >
              {conferindoCupom ? <Loader2 aria-hidden size={14} className="animate-spin" /> : "Aplicar"}
            </button>
          </div>
          {erroCupom && <p className="carrinho__cupom-erro" role="alert">{erroCupom}</p>}
        </div>

        <dl className="carrinho__contas">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatar(subtotalCentavos)}</dd>
          </div>

          {cupomAtivo && (
            <div className="carrinho__contas-desconto">
              <dt>
                Desconto · {cupomAtivo.codigo}
                <button
                  type="button"
                  className="carrinho__cupom-tirar"
                  onClick={tirarCupom}
                >
                  remover
                </button>
              </dt>
              <dd>− {formatar(descontoCentavos)}</dd>
            </div>
          )}

          <div className="carrinho__contas-total">
            <dt>Total</dt>
            <dd>{formatar(totalAPagar)}</dd>
          </div>
        </dl>

        <p className="carrinho__frete">
          O frete é combinado junto com o pagamento, pelo WhatsApp.
        </p>
      </section>

      <section className="checkout">
        <p className="pdp__eyebrow">Seus dados</p>
        <h2 className="pdp__nome" style={{ fontSize: 28 }}>Para onde vai a peça</h2>

        {demo && (
          <div className="checkout__aviso" style={{ marginTop: 22, marginBottom: 0 }}>
            O Supabase ainda não está conectado, então o pedido não pode ser registrado.
            Preencha <code>.env.local</code> para ativar o fechamento.
          </div>
        )}

        <form onSubmit={fechar}>
          <div className="checkout__grade">
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

            <div className="checkout__campo">
              <label className="checkout__rotulo" htmlFor="ck-cep">CEP</label>
              <input
                className="checkout__input"
                id="ck-cep"
                name="cep"
                inputMode="numeric"
                required
                placeholder="00000-000"
                onChange={(e) => consultarCep(e.target.value)}
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

          <button
            className="pdp__comprar"
            type="submit"
            disabled={enviando || demo || subtotalCentavos === 0}
            style={{ marginTop: 28, width: "100%" }}
          >
            {enviando && <Loader2 aria-hidden size={15} className="animate-spin" />}
            Enviar pedido · {formatar(totalAPagar)}
          </button>

          {subtotalCentavos === 0 && (
            <p className="pdp__nota" style={{ marginTop: 14 }}>
              As peças do seu carrinho estão sem unidades no momento. Remova-as ou fale com a
              Florenza pelo WhatsApp para encomendar.
            </p>
          )}
        </form>

        {erro && <p className="checkout__erro" role="alert">{erro}</p>}

        <p className="pdp__nota">
          Nenhum pagamento acontece agora. O pedido chega para a Florenza, que entra em
          contato pelo WhatsApp para combinar a forma de pagamento e o prazo.
        </p>
      </section>
    </>
  );
}
