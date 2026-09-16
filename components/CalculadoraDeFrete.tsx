"use client";

import { useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { buscarCep, formatarCep } from "@/lib/documentos";
import { cotarFrete, descreverPrazo, valorDoFrete, type OpcaoDeFrete } from "@/lib/frete";

type Estado =
  | { tipo: "ocioso" }
  | { tipo: "calculando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; opcoes: OpcaoDeFrete[]; lugar: string };

/**
 * "Frete e prazo" na página da peça.
 *
 * Responde antes do carrinho a pergunta que mais segura uma compra pela
 * internet: quanto custa e quando chega. É só consulta — o frete que vale é o
 * que `criar_pedido()` calcula no fechamento, pela mesma tabela.
 *
 * O ViaCEP entra em paralelo só para dizer a cidade ("Entrega em Niterói/RJ"),
 * que confirma para a pessoa que o CEP está certo. Se ele falhar, a cotação sai
 * do mesmo jeito: o banco descobre o estado pelo próprio CEP.
 */
export function CalculadoraDeFrete() {
  const [cep, setCep] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });

  async function calcular(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (cep.replace(/\D/g, "").length !== 8) {
      setEstado({ tipo: "erro", mensagem: "Digite os 8 números do CEP." });
      return;
    }

    setEstado({ tipo: "calculando" });
    const [endereco, primeira] = await Promise.all([buscarCep(cep), cotarFrete(cep)]);
    // CEP fora das faixas que o banco conhece: tenta de novo com o estado do ViaCEP.
    const resposta = "erro" in primeira && endereco?.uf ? await cotarFrete(cep, endereco.uf) : primeira;

    if ("erro" in resposta) {
      setEstado({ tipo: "erro", mensagem: resposta.erro });
      return;
    }
    const { uf, ufNome } = resposta.opcoes[0];
    setEstado({
      tipo: "pronto",
      opcoes: resposta.opcoes,
      lugar: endereco?.cidade ? `${endereco.cidade}/${uf}` : ufNome,
    });
  }

  return (
    <section className="frete" aria-labelledby="frete-titulo">
      <div className="frete__topo">
        <Truck aria-hidden size={15} />
        <h2 className="frete__titulo" id="frete-titulo">Frete e prazo</h2>
      </div>

      <form className="frete__linha" onSubmit={calcular} noValidate>
        <label className="sr-only" htmlFor="frete-cep">CEP de entrega</label>
        <input
          className="frete__campo"
          id="frete-cep"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Seu CEP"
          value={cep}
          onChange={(e) => setCep(formatarCep(e.target.value))}
        />
        <button className="frete__botao" type="submit" disabled={estado.tipo === "calculando"}>
          {estado.tipo === "calculando" ? <Loader2 aria-hidden size={14} className="animate-spin" /> : "Calcular"}
        </button>
      </form>
      <a
        className="frete__link"
        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
        target="_blank"
        rel="noopener noreferrer"
      >
        Não sei meu CEP
      </a>

      <div aria-live="polite">
        {estado.tipo === "erro" && <p className="frete__erro">{estado.mensagem}</p>}
        {estado.tipo === "pronto" && (
          <>
            <p className="frete__lugar">Entrega em {estado.lugar}</p>
            <ul className="frete__opcoes">
              {estado.opcoes.map((o) => (
                <li className="frete__opcao" key={o.modalidade}>
                  <span className="frete__nome">{o.nome}</span>
                  <span className="frete__prazo">Chega em {descreverPrazo(o.prazoMinDias, o.prazoMaxDias)}</span>
                  <span className="frete__preco">{valorDoFrete(o.precoCentavos)}</span>
                </li>
              ))}
            </ul>
            <p className="frete__nota">
              O prazo conta a partir da postagem. A forma de envio é escolhida no carrinho.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
