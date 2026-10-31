-- ============================================================================
-- FLORENZA — NOMES DAS ALIANÇAS DE OURO E FIM DO "ABAULADO"
--
-- Decisão da loja em 31/10/2026: as alianças 002, 003, 005 e 033 passam a usar
-- os nomes da lista da loja, e a descrição acompanha. "Abaulado" sai de todas,
-- inclusive da 9013 (prata), que mantém o nome e o resto do texto.
--
-- O slug fica como está, para não quebrar link já enviado ou indexado. Pedido
-- antigo guarda o nome da época em `pedido_itens.nome` e não muda.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

update public.produtos as p
   set nome = n.nome, descricao = n.descricao
  from (values
    ('002', 'Linha Tradicional Meia Cana 2.5mm',
     'Meia cana polida por inteiro: o desenho da linha tradicional na medida mais delicada. Peso aproximado do par: 1,7 g.'),
    ('003', 'Linha Tradicional Meia Cana 3mm',
     'Meia cana polida em três milímetros: o clássico da linha tradicional, simples e atemporal. Peso aproximado do par: 2,3 g.'),
    ('005', 'Linha Tradicional Meia Cana 4mm',
     'Meia cana polida em quatro milímetros: a linha tradicional com mais presença no dedo. Peso aproximado do par: 3,7 g.'),
    ('033', 'Linha Trabalhada 4mm',
     'Peça da linha trabalhada: riscas diamantadas em diagonal correndo entre duas bordas polidas. Peso aproximado do par: 3,0 g.')
  ) as n (sku, nome, descricao)
 where p.sku = n.sku;

update public.produtos
   set descricao = 'Aro polido, sem relevo — o desenho mais simples da linha.'
 where sku = '9013';

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'nomes da lista da loja' as checagem,
       case when exists (select 1 from public.produtos
                          where sku in ('002', '003', '005', '033')
                            and (sku, nome) not in (('002', 'Linha Tradicional Meia Cana 2.5mm'),
                                                    ('003', 'Linha Tradicional Meia Cana 3mm'),
                                                    ('005', 'Linha Tradicional Meia Cana 4mm'),
                                                    ('033', 'Linha Trabalhada 4mm')))
            then 'FALHOU' else 'ok' end as resultado
union all
select 'nenhuma descrição diz abaulado',
       case when exists (select 1 from public.produtos where descricao ilike '%abaulad%')
            then 'FALHOU' else 'ok' end;
