"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Map as MapIcon, TrendingUp, Gem, Store, Building2 } from "lucide-react";
import { MapaBrasil } from "@/components/admin/MapaBrasil";
import { SectionCard, Vazio } from "@/components/admin/Primitivos";
import { COR_SERIE, formatarEixoValor, formatarPreco, plural } from "@/lib/admin/format";
import type { DashboardData } from "@/lib/admin/dashboard-data";

/** Tooltip própria: a padrão do Recharts não conhece a paleta da Florenza. */
function Dica({
  active, payload, label, formatar,
}: {
  active?: boolean;
  payload?: { value: number; name?: string; payload?: Record<string, unknown> }[];
  label?: string;
  formatar: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="adm-mapa__dica" style={{ position: "static" }}>
      {label && <p className="adm-mapa__dica-uf">{label}</p>}
      <p className="adm-mapa__dica-linha">{formatar(payload[0].value)}</p>
    </div>
  );
}

const EIXO = { fill: "#726348", fontSize: 11 };
const GRADE = "rgba(125, 99, 48,.22)";

export function VendasSection({ dados }: { dados: DashboardData }) {
  const [regiao, setRegiao] = useState<string | null>(null);

  // Clicar numa região no mapa filtra o resto do painel. O mapa responde
  // "onde"; os gráficos ao lado respondem "quanto" — juntos, sem que nenhum
  // precise fazer os dois papéis.
  const cidades = useMemo(() => {
    if (!regiao) return dados.cidades;
    const ufsDaRegiao = new Set(dados.mapa.filter((l) => l.regiao === regiao).map((l) => l.uf));
    return dados.cidades.filter((c) => c.uf && ufsDaRegiao.has(c.uf));
  }, [dados, regiao]);

  const regioesOrdenadas = useMemo(
    () => [...dados.regioes].sort((a, b) => b.totalCentavos - a.totalCentavos),
    [dados.regioes]
  );

  const temVenda = dados.regioes.some((r) => r.totalCentavos > 0);
  const totalOrigens = dados.origens.reduce((s, o) => s + o.quantidade, 0);

  return (
    <div className="flex flex-col gap-7">
      {/* ---------- Mapa + regiões ---------- */}
      <SectionCard
        icone={MapIcon}
        titulo="De onde vêm as vendas"
        acao={
          regiao ? (
            <span className="adm-legenda">Filtrando por {regiao}</span>
          ) : (
            <span className="adm-legenda">Clique num estado para filtrar</span>
          )
        }
      >
        {!temVenda ? (
          <Vazio>
            Nenhuma venda registrada ainda. Assim que o primeiro pedido tiver um estado,
            ele acende aqui no mapa.
          </Vazio>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
            <MapaBrasil dados={dados.mapa} regiaoSelecionada={regiao} onSelecionarRegiao={setRegiao} />

            <div>
              <p className="adm-legenda">Faturamento por região</p>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regioesOrdenadas} layout="vertical" margin={{ left: 8, right: 20 }}>
                    <CartesianGrid stroke={GRADE} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={EIXO}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatarEixoValor(Number(v))}
                    />
                    <YAxis type="category" dataKey="regiao" tick={EIXO} axisLine={false} tickLine={false} width={96} />
                    <Tooltip
                      content={<Dica formatar={formatarPreco} />}
                      cursor={{ fill: "rgba(212, 185, 115,.10)" }}
                    />
                    <Bar dataKey="totalCentavos" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {regioesOrdenadas.map((r) => (
                        <Cell
                          key={r.regiao}
                          fill={COR_SERIE}
                          opacity={regiao && r.regiao !== regiao ? 0.3 : 1}
                          cursor="pointer"
                          onClick={() => setRegiao(regiao === r.regiao ? null : r.regiao)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="adm-legenda mt-7">
                {regiao ? `Cidades do ${regiao}` : "Cidades que mais compram"}
              </p>
              {cidades.length === 0 ? (
                <p className="adm-mapa__dica-linha mt-3">Nenhuma cidade nesta região ainda.</p>
              ) : (
                <ul className="adm-lista mt-3">
                  {cidades.map((c) => (
                    <li className="adm-lista__item" key={`${c.cidade}-${c.uf}`}>
                      <span className="adm-lista__nome">
                        {c.cidade}
                        {c.uf ? <span className="adm-lista__meta"> · {c.uf}</span> : null}
                      </span>
                      <span className="adm-lista__meta">
                        {formatarPreco(c.totalCentavos)} · {plural(c.pedidos, "pedido", "pedidos")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-7 xl:grid-cols-2">
        {/* ---------- Faturamento por mês ---------- */}
        <SectionCard icone={TrendingUp} titulo="Faturamento nos últimos 12 meses">
          {dados.meses.every((m) => m.totalCentavos === 0) ? (
            <Vazio>Ainda não há faturamento para desenhar a linha.</Vazio>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dados.meses} margin={{ left: 4, right: 14, top: 10, bottom: 4 }}>
                  <CartesianGrid stroke={GRADE} vertical={false} />
                  <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={EIXO}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => formatarEixoValor(Number(v))}
                  />
                  <Tooltip content={<Dica formatar={formatarPreco} />} cursor={{ stroke: "rgba(212, 185, 115,.35)" }} />
                  <Line
                    type="monotone"
                    dataKey="totalCentavos"
                    stroke={COR_SERIE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* ---------- Peças mais vendidas ---------- */}
        <SectionCard icone={Gem} titulo="Peças mais vendidas">
          {dados.maisVendidos.length === 0 ? (
            <Vazio>Nenhuma peça vendida ainda.</Vazio>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.maisVendidos} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid stroke={GRADE} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={EIXO}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatarEixoValor(Number(v))}
                  />
                  <YAxis type="category" dataKey="nome" tick={EIXO} axisLine={false} tickLine={false} width={172} />
                  <Tooltip content={<Dica formatar={formatarPreco} />} cursor={{ fill: "rgba(212, 185, 115,.10)" }} />
                  <Bar dataKey="totalCentavos" fill={COR_SERIE} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* ---------- Origem do pedido ---------- */}
        <SectionCard icone={Store} titulo="Como o cliente chegou">
          {dados.origens.length === 0 ? (
            <Vazio>Nenhum pedido com origem registrada neste mês.</Vazio>
          ) : (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dados.origens}
                      dataKey="quantidade"
                      nameKey="rotulo"
                      innerRadius="60%"
                      outerRadius="100%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {dados.origens.map((o) => (
                        <Cell key={o.origem} fill={o.cor} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* A legenda traz nome e número ao lado da cor: assim o gráfico se
                  lê mesmo sem distinguir os tons. */}
              <ul className="w-full flex flex-col gap-2">
                {dados.origens.map((o) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={o.origem}>
                    <span className="flex items-center gap-2 adm-lista__nome">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: o.cor }}
                      />
                      {o.rotulo}
                    </span>
                    <span className="adm-lista__meta">
                      {o.quantidade} ({Math.round((o.quantidade / totalOrigens) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        {/* ---------- Estados, em número ---------- */}
        <SectionCard icone={Building2} titulo="Estados, em número">
          {!temVenda ? (
            <Vazio>Sem vendas para listar.</Vazio>
          ) : (
            <ul className="adm-lista">
              {[...dados.mapa]
                .filter((l) => l.totalCentavos > 0)
                .sort((a, b) => b.totalCentavos - a.totalCentavos)
                .slice(0, 8)
                .map((l) => (
                  <li className="adm-lista__item" key={l.uf}>
                    <span className="adm-lista__nome">
                      {l.ufNome}
                      <span className="adm-lista__meta"> · {l.regiao}</span>
                    </span>
                    <span className="adm-lista__meta">
                      {formatarPreco(l.totalCentavos)} · {plural(l.pedidos, "pedido", "pedidos")}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
