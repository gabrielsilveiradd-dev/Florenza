"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gem, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { SectionCard, Vazio } from "@/components/admin/Primitivos";
import { createClient } from "@/lib/supabase/client";
import { formatarPreco, reaisParaCentavos } from "@/lib/admin/format";
import type { ProdutoAdmin } from "@/lib/admin/listas";

const AROS = [
  { valor: 0, rotulo: "Sem aro" },
  { valor: 1, rotulo: "1 aro" },
  { valor: 2, rotulo: "Par (2 aros)" },
];

const paraTexto = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/**
 * Redimensiona no navegador. WebP quando o navegador sabe gerar; o Safari
 * antigo devolve PNG ao pedir WebP, e aí vai JPEG — PNG de foto de joia pesa
 * dez vezes mais.
 */
async function redimensionar(arquivo: File, largura: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, largura / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Canvas indisponível");
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const gerar = (tipo: string, qualidade: number) =>
    new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade));
  const webp = await gerar("image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await gerar("image/jpeg", 0.88);
  if (!jpeg) throw new Error("Não foi possível gerar a imagem");
  return jpeg;
}

/**
 * Gerenciar o que aparece para o público.
 *
 * A operação mais usada aqui não é apagar, é ATIVAR/DESATIVAR: a peça sai da
 * vitrine e continua no painel, com a história de venda intacta. Apagar de
 * verdade é o caso raro, e por isso pede confirmação.
 *
 * PREÇO E ESTOQUE são editados na própria linha. O preço novo vale para o
 * próximo pedido — os já feitos guardam o preço da hora da compra. O estoque é
 * o DISPONÍVEL: peça reservada em pedido aguardando pagamento já saiu dele.
 * A vitrine atualiza em até um minuto (`revalidate = 60`).
 *
 * O upload de foto redimensiona no navegador antes de subir, gerando as duas
 * versões (960px e 480px) que o `srcset` da vitrine espera — a mesma convenção
 * de nome que tools/importar-aneis-formatura.py usa. O `?v=` no fim da URL
 * existe porque o arquivo é substituído no mesmo caminho: sem ele, navegador e
 * CDN continuariam mostrando a foto antiga.
 */
export function CatalogoSection({
  produtos,
  categorias,
  demo,
}: {
  produtos: ProdutoAdmin[];
  categorias: { slug: string; nome: string }[];
  demo: boolean;
}) {
  const router = useRouter();
  const [categoria, setCategoria] = useState<string>("todas");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const visiveis = categoria === "todas" ? produtos : produtos.filter((p) => p.categoria_slug === categoria);
  const ativos = produtos.filter((p) => p.ativo).length;

  async function atualizar(produto: ProdutoAdmin, campos: Record<string, unknown>, falha: string) {
    if (demo) return;
    setErro(null);
    setSalvando(produto.id);
    const { data, error } = await createClient()
      .from("produtos")
      .update(campos)
      .eq("id", produto.id)
      .select("id");
    setSalvando(null);
    if (error || !data?.length) {
      setErro(falha);
      return;
    }
    router.refresh();
  }

  async function excluir(produto: ProdutoAdmin) {
    if (demo) return;
    if (!window.confirm(`Excluir "${produto.nome}" de vez? Para só tirar da vitrine, use o olho.`)) return;
    setErro(null);
    setSalvando(produto.id);
    const { error } = await createClient().from("produtos").delete().eq("id", produto.id);
    setSalvando(null);
    if (error) {
      setErro("Não foi possível excluir. Se a peça já foi vendida, prefira desativá-la.");
      return;
    }
    router.refresh();
  }

  async function enviarFoto(produto: ProdutoAdmin, arquivo: File) {
    if (demo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem.");
      return;
    }
    setErro(null);
    setSalvando(produto.id);
    try {
      const [grande, pequena] = await Promise.all([redimensionar(arquivo, 960), redimensionar(arquivo, 480)]);
      const extensao = grande.type === "image/webp" ? "webp" : "jpg";
      const supabase = createClient();
      const base = `${produto.categoria_slug}/${produto.sku}`;
      const arquivos: Array<[string, Blob]> = [
        [`${base}.${extensao}`, grande],
        [`${base}-sm.${extensao}`, pequena],
      ];

      for (const [caminho, blob] of arquivos) {
        const { error } = await supabase.storage
          .from("produtos")
          .upload(caminho, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
        if (error) throw error;
      }

      // A versão sai do próprio arquivo: foto diferente, URL diferente; a mesma
      // foto enviada duas vezes mantém o cache.
      const versao = `${arquivo.lastModified.toString(36)}${arquivo.size.toString(36)}`;
      const urlPublica = (caminho: string) =>
        `${supabase.storage.from("produtos").getPublicUrl(caminho).data.publicUrl}?v=${versao}`;
      const { data, error } = await supabase
        .from("produtos")
        .update({ imagem_url: urlPublica(arquivos[0][0]), imagem_sm_url: urlPublica(arquivos[1][0]) })
        .eq("id", produto.id)
        .select("id");
      if (error || !data?.length) throw error ?? new Error("Nenhuma linha atualizada");
      router.refresh();
    } catch (e) {
      console.error("[catálogo] envio de foto falhou:", e);
      setErro("Não foi possível enviar a foto. Confira se o arquivo é uma imagem e tente de novo.");
    } finally {
      setSalvando(null);
    }
  }

  async function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;
    setErroForm(null);

    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const sku = String(dados.get("sku") ?? "").trim();
    const nome = String(dados.get("nome") ?? "").trim();
    const precoCentavos = reaisParaCentavos(String(dados.get("preco") ?? ""));
    if (!sku || !nome || precoCentavos === null) {
      setErroForm("Código, nome e um preço válido são obrigatórios.");
      return;
    }

    setEnviando(true);
    const supabase = createClient();
    const { error } = await supabase.from("produtos").insert({
      sku,
      // Slug a partir do nome: sem acento, sem espaço, minúsculo.
      slug: nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      categoria_slug: String(dados.get("categoria") ?? categorias[0]?.slug),
      nome,
      metal: String(dados.get("metal") ?? "").trim() || null,
      descricao: String(dados.get("descricao") ?? "").trim() || null,
      preco_centavos: precoCentavos,
      estoque: Number(dados.get("estoque") ?? 0) || 0,
      aros: Number(dados.get("aros") ?? 1),
      ativo: true,
    });
    setEnviando(false);

    if (error) {
      setErroForm("Não foi possível cadastrar. O código pode já estar em uso.");
      return;
    }
    formulario.reset();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      <SectionCard icone={Gem} titulo="Cadastrar peça">
        <p className="adm-mapa__dica-linha mb-4">
          O código é a chave de negócio — é por ele que a peça é encontrada na gaveta, e ele
          vem do nome do arquivo da foto original. A foto entra depois, pela lista abaixo.
        </p>
        <form className="adm-form" onSubmit={cadastrar}>
          <div className="adm-campo w-28">
            <label className="adm-campo__rotulo" htmlFor="pr-sku">Código</label>
            <input className="adm-input" id="pr-sku" name="sku" required placeholder="3187" />
          </div>
          <div className="adm-campo grow min-w-44">
            <label className="adm-campo__rotulo" htmlFor="pr-nome">Nome</label>
            <input className="adm-input" id="pr-nome" name="nome" required placeholder="Anel Rubi Clássico" />
          </div>
          <div className="adm-campo w-48">
            <label className="adm-campo__rotulo" htmlFor="pr-cat">Categoria</label>
            <select className="adm-input" id="pr-cat" name="categoria" defaultValue={categorias[0]?.slug}>
              {categorias.map((c) => (
                <option key={c.slug} value={c.slug}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="adm-campo w-44">
            <label className="adm-campo__rotulo" htmlFor="pr-metal">Metal</label>
            <input className="adm-input" id="pr-metal" name="metal" placeholder="Ouro 18K (750)" />
          </div>
          <div className="adm-campo w-36">
            <label className="adm-campo__rotulo" htmlFor="pr-preco">Preço (R$)</label>
            <input className="adm-input" id="pr-preco" name="preco" required inputMode="decimal" placeholder="2.420,00" />
          </div>
          <div className="adm-campo w-28">
            <label className="adm-campo__rotulo" htmlFor="pr-estoque">Estoque</label>
            <input className="adm-input" id="pr-estoque" name="estoque" type="number" min={0} defaultValue={0} />
          </div>
          <div className="adm-campo w-36">
            {/* Decide quantos seletores de medida a página da peça mostra. */}
            <label className="adm-campo__rotulo" htmlFor="pr-aros">Medida</label>
            <select className="adm-input" id="pr-aros" name="aros" defaultValue={1}>
              {AROS.map((a) => (
                <option key={a.valor} value={a.valor}>{a.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="adm-campo grow min-w-52">
            <label className="adm-campo__rotulo" htmlFor="pr-desc">Descrição</label>
            <input className="adm-input" id="pr-desc" name="descricao" placeholder="Como a peça é" />
          </div>
          <button className="adm-botao" type="submit" disabled={enviando || demo}>
            {enviando && <Loader2 aria-hidden size={14} className="animate-spin" />}
            Cadastrar
          </button>
        </form>
        {erroForm && <p className="adm-erro" role="alert">{erroForm}</p>}
      </SectionCard>

      <SectionCard
        icone={Gem}
        titulo={`Catálogo — ${ativos} de ${produtos.length} à venda`}
        acao={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`adm-botao adm-botao--fantasma${categoria === "todas" ? " is-active" : ""}`}
              onClick={() => setCategoria("todas")}
            >
              Todas
            </button>
            {categorias.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`adm-botao adm-botao--fantasma${categoria === c.slug ? " is-active" : ""}`}
                onClick={() => setCategoria(c.slug)}
              >
                {c.nome}
              </button>
            ))}
          </div>
        }
      >
        <p className="adm-mapa__dica-linha mb-4">
          Estoque é o que está disponível — peças reservadas em pedidos aguardando pagamento já
          saíram dele. Preço novo vale para os próximos pedidos. A vitrine atualiza em até um minuto.
        </p>
        {erro && <p className="adm-erro" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{erro}</p>}

        {visiveis.length === 0 ? (
          <Vazio>Nenhuma peça nesta categoria.</Vazio>
        ) : (
          <ul className="adm-lista">
            {visiveis.map((produto) => (
              <LinhaDoProduto
                // Os valores salvos entram na chave: depois de salvar (ou de outra
                // pessoa mudar), a linha renasce com o que está no banco.
                key={`${produto.id}:${produto.preco_centavos}:${produto.estoque}:${produto.aros}`}
                produto={produto}
                demo={demo}
                ocupado={salvando === produto.id}
                salvar={(campos) => atualizar(produto, campos, "Não foi possível salvar a peça.")}
                alternarAtivo={() =>
                  atualizar(produto, { ativo: !produto.ativo }, "Não foi possível mudar a visibilidade da peça.")
                }
                excluir={() => excluir(produto)}
                enviarFoto={(arquivo) => enviarFoto(produto, arquivo)}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function LinhaDoProduto({
  produto,
  demo,
  ocupado,
  salvar,
  alternarAtivo,
  excluir,
  enviarFoto,
}: {
  produto: ProdutoAdmin;
  demo: boolean;
  ocupado: boolean;
  salvar: (campos: { preco_centavos: number; estoque: number; aros: number }) => void;
  alternarAtivo: () => void;
  excluir: () => void;
  enviarFoto: (arquivo: File) => void;
}) {
  const [preco, setPreco] = useState(paraTexto(produto.preco_centavos));
  const [estoque, setEstoque] = useState(String(produto.estoque));
  const [aros, setAros] = useState(produto.aros);

  const centavos = reaisParaCentavos(preco);
  const quantidade = Number(estoque);
  const valido = centavos !== null && estoque.trim() !== "" && Number.isInteger(quantidade) && quantidade >= 0;
  const mudou = centavos !== produto.preco_centavos || quantidade !== produto.estoque || aros !== produto.aros;
  const foto = produto.imagem_sm_url ?? produto.imagem_url;
  const bloqueado = ocupado || demo;

  return (
    <li className="adm-lista__item" style={{ opacity: produto.ativo ? 1 : 0.55 }}>
      <label className="adm-foto" title={foto ? "Trocar a foto" : "Enviar foto"}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" width={56} height={56} />
        ) : (
          <span className="adm-foto__vazia"><ImagePlus aria-hidden size={18} /></span>
        )}
        <span className="adm-foto__rotulo">
          {ocupado ? "Enviando…" : foto ? "Trocar foto" : "Enviar foto"}
        </span>
        <input
          type="file"
          accept="image/*"
          disabled={bloqueado}
          aria-label={`Foto de ${produto.nome}`}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            // Limpa já, para escolher o mesmo arquivo de novo disparar o evento.
            e.target.value = "";
            if (arquivo) enviarFoto(arquivo);
          }}
        />
      </label>

      <div className="min-w-44 grow">
        <span className="adm-lista__nome">{produto.nome}</span>
        <p className="adm-lista__meta">
          Cód. {produto.sku} · {produto.categoria_slug} · {formatarPreco(produto.preco_centavos)}
        </p>
      </div>

      <form
        className="adm-produto__edicao"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido && mudou && centavos !== null) salvar({ preco_centavos: centavos, estoque: quantidade, aros });
        }}
      >
        <div className="adm-campo w-28">
          <label className="adm-campo__rotulo" htmlFor={`preco-${produto.id}`}>Preço (R$)</label>
          <input
            className="adm-input"
            id={`preco-${produto.id}`}
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            aria-invalid={centavos === null ? true : undefined}
            disabled={demo}
          />
        </div>
        <div className="adm-campo w-20">
          <label className="adm-campo__rotulo" htmlFor={`estoque-${produto.id}`}>Estoque</label>
          <input
            className="adm-input"
            id={`estoque-${produto.id}`}
            type="number"
            min={0}
            step={1}
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
            disabled={demo}
          />
        </div>
        <div className="adm-campo w-32">
          <label className="adm-campo__rotulo" htmlFor={`aros-${produto.id}`}>Medida</label>
          <select
            className="adm-input"
            id={`aros-${produto.id}`}
            value={aros}
            onChange={(e) => setAros(Number(e.target.value))}
            disabled={demo}
          >
            {AROS.map((a) => (
              <option key={a.valor} value={a.valor}>{a.rotulo}</option>
            ))}
          </select>
        </div>
        <button className="adm-botao adm-botao--fantasma" type="submit" disabled={!mudou || !valido || bloqueado}>
          {ocupado && <Loader2 aria-hidden size={12} className="animate-spin" />}
          Salvar
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {produto.ativo && produto.estoque <= 0 && <span className="adm-tag adm-tag--aguardando">Esgotada</span>}
        <span className="adm-tag">{produto.ativo ? "Na vitrine" : "Fora da vitrine"}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="adm-icone"
          aria-label={produto.ativo ? `Tirar ${produto.nome} da vitrine` : `Pôr ${produto.nome} na vitrine`}
          disabled={bloqueado}
          onClick={alternarAtivo}
        >
          {produto.ativo ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}
        </button>
        <button
          type="button"
          className="adm-icone"
          aria-label={`Excluir ${produto.nome}`}
          disabled={bloqueado}
          onClick={excluir}
        >
          <Trash2 aria-hidden size={15} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}
