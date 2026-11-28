grant update (lida_em) on public.mensagens to authenticated;
drop policy if exists mensagens_destinatario_mark_read on public.mensagens;
create policy mensagens_destinatario_mark_read
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
  and lida_em is not null
  and exists (
    select 1 from public.conversas c
    where c.id = conversa_id
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);
