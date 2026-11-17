-- Keep conversation ordering current whenever a message is added.
create or replace function public.touch_conversa_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversas
  set ultima_mensagem_em = new.criada_em
  where id = new.conversa_id;
  return new;
end;
$$;

drop trigger if exists mensagens_touch_conversa on public.mensagens;
create trigger mensagens_touch_conversa
after insert on public.mensagens
for each row execute function public.touch_conversa_on_message();
