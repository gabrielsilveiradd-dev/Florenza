"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingUp, Gem, Building2 } from "lucide-react";
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
  const temVenda = dados.regioes.some((r) => r.totalCentavos > 0);

  return (
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
  );
}
