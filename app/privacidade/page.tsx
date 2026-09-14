import type { Metadata } from "next";
import Link from "next/link";
import { ComoFalar, DadosDaLoja, PaginaInstitucional } from "@/components/institucional/PaginaInstitucional";

import "../institucional.css";

export const metadata: Metadata = {
  title: "Privacidade — Florenza",
  description: "Quais dados a Florenza coleta, para quê, com quem compartilha e como exercer seus direitos.",
};

/* Texto-base: revisar com advogado ou contador antes de abrir a loja.
 *
 * A lista de "com quem compartilhamos" é a lista real de serviços que o código
 * chama. Serviço novo — analytics, pixel de anúncio, outro meio de pagamento —
 * entra aqui ANTES de ir ao ar. */
export default function Privacidade() {
  return (
    <PaginaInstitucional caminho="/privacidade" titulo="Política de privacidade" atualizadoEm="14 de setembro de 2026">
      <p>
        Esta política explica quais dados pessoais a Florenza trata quando você usa o site, para quê,
        com quem eles são compartilhados e como você exerce os seus direitos, conforme a Lei Geral de
        Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2>Quem é responsável pelos dados</h2>
      <DadosDaLoja />

      <h2>Quais dados coletamos</h2>
      <ul>
        <li><strong>Conta:</strong> nome, e-mail, WhatsApp e senha — a senha é guardada cifrada pelo serviço de autenticação e ninguém da loja tem acesso a ela.</li>
        <li><strong>Pedido:</strong> CPF, endereço de entrega, peças compradas, medida do aro, observações e a mensagem de presente, se houver.</li>
        <li><strong>Pagamento:</strong> a situação do pagamento, a forma usada e o valor. Os dados do cartão são digitados no Mercado Pago e não chegam à Florenza.</li>
        <li><strong>Navegação:</strong> os cookies necessários para manter você conectado. O carrinho fica guardado no seu próprio navegador.</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li><strong>Para cumprir a compra</strong> — registrar o pedido, receber o pagamento, preparar e entregar a peça e falar com você sobre ela.</li>
        <li><strong>Para cumprir a lei</strong> — emitir nota fiscal e guardar os registros de venda pelo prazo que a legislação fiscal exige.</li>
        <li><strong>Para proteger a loja e os clientes</strong> — limitar pedidos em aberto por conta e conferir que um cupom de primeira compra seja usado uma única vez por CPF.</li>
      </ul>
      <p>A Florenza não vende nem aluga dados pessoais.</p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li><strong>Supabase</strong> — guarda o banco de dados e cuida do login.</li>
        <li><strong>Vercel</strong> — hospeda o site.</li>
        <li><strong>Mercado Pago</strong> — processa o pagamento; recebe nome, e-mail, CPF e o valor do pedido.</li>
        <li><strong>Transportadora</strong> — recebe nome e endereço para a entrega.</li>
        <li><strong>Serviço de e-mail</strong> — envia a confirmação e as atualizações do pedido.</li>
        <li><strong>ViaCEP</strong> — ao digitar o CEP, só o CEP é consultado para preencher o endereço.</li>
      </ul>
      <p>
        Alguns desses serviços mantêm servidores fora do Brasil. O tratamento segue as garantias
        exigidas pela LGPD para esse caso.
      </p>

      <h2>Por quanto tempo</h2>
      <p>
        Os dados da conta ficam guardados enquanto ela existir. Os registros de pedidos são mantidos
        pelo prazo exigido pela legislação fiscal, mesmo depois de a conta ser excluída.
      </p>

      <h2>Seus direitos</h2>
      <p>Você pode, a qualquer momento:</p>
      <ul>
        <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
        <li>corrigir dados incompletos ou desatualizados — boa parte direto em <Link href="/conta">Minha conta</Link>;</li>
        <li>pedir a anonimização, o bloqueio ou a exclusão do que não for necessário ou exigido por lei;</li>
        <li>pedir a portabilidade dos seus dados;</li>
        <li>saber com quem eles foram compartilhados;</li>
        <li>revogar um consentimento que tenha dado.</li>
      </ul>
      <p>
        Para exercer qualquer um deles, fale com a Florenza <ComoFalar />. Respondemos em até 15
        dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>Segurança</h2>
      <p>
        O acesso aos dados é restrito por regras no próprio banco: cada cliente enxerga só os
        próprios pedidos, e só a equipe da loja vê os de todos. A conexão com o site é sempre cifrada.
      </p>
    </PaginaInstitucional>
  );
}
