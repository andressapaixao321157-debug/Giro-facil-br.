-- Giro Fácil BR: amplia as categorias de anúncios sem alterar os registros existentes.
-- Execute automaticamente pelo fluxo de migrações do Supabase.

alter table public.anuncios
  drop constraint if exists anuncios_categoria_check;

alter table public.anuncios
  add constraint anuncios_categoria_check
  check (categoria in (
    'Carro',
    'Moto',
    'Caminhão',
    'Utilitário',
    'Máquinas e equipamentos',
    'Embarcações',
    'Imóvel para venda',
    'Imóvel para aluguel',
    'Roupas e acessórios',
    'Objetos e diversos',
    'Móveis e decoração',
    'Eletrônicos',
    'Casa e construção',
    'Agro e pecuária',
    'Esportes e lazer'
  ));
