-- Tira o SELECT de `anon` sobre cupons.
--
-- A RLS já devolvia lista vazia, então isto não corrige um vazamento — corrige
-- a profundidade da defesa. Uma lista de cupons é uma lista de descontos para
-- quem souber pedir, e visitante nenhum tem motivo para consultá-la: quem
-- precisa saber se um código vale usa `conferir_cupom()`, que responde só sobre
-- o código perguntado.
--
-- `authenticated` continua com o grant de propósito: é por ali que um dia o
-- painel vai listar os cupons, e lá a policy "Admin gerencia cupons" já
-- restringe a quem é do time.
--
-- Migration própria, e não emendada na anterior, porque foi assim que entrou no
-- banco — a versão do arquivo tem que bater com a versão registrada, senão um
-- `db push` reaplica tudo.
revoke select on public.cupons from anon;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as duas linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'cupons fechada para anon' as checagem,
       case when has_table_privilege('anon', 'public.cupons', 'SELECT')
            then 'FALHOU' else 'ok' end as resultado
union all
select 'authenticated mantém o grant (para o painel)',
       case when has_table_privilege('authenticated', 'public.cupons', 'SELECT')
            then 'ok' else 'FALHOU' end;
