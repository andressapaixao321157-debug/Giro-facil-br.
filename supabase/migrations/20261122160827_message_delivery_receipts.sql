-- Confirma entrega no dispositivo do destinatário, separada da confirmação de leitura.
alter table public.mensagens
  add column if not exists entregue_em timestamptz;

-- O cliente autenticado só pode preencher a confirmação de entrega das mensagens
-- recebidas por ele; não pode alterar conteúdo, remetente ou conversa.
grant update (entregue_em) on public.mensagens to authenticated;

drop policy if exists mensagens_destinatario_mark_delivered on public.mensagens;
create policy mensagens_destinatario_mark_delivered
on public.mensagens for update to authenticated
using (
  remetente_id <> (select auth.uid())
  and exists (
    select 1 from public.conversas c
    where c.id = conversa_id
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
)
with check (
  remetente_id <> (select auth.uid())
  and entregue_em is not null
  and exists (
    select 1 from public.conversas c
    where c.id = conversa_id
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);
