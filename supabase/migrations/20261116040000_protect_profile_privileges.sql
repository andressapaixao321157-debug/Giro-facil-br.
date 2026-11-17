-- Giro Fácil BR: impede que um usuário altere seu próprio papel ou dados internos de pagamento.
-- Edge Functions com service_role (auth.uid() IS NULL) continuam podendo atualizar esses campos.

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.papel is distinct from 'usuario'
         or new.asaas_customer_id is not null
         or new.plano_status is distinct from 'inativo'
         or new.plano_asaas_subscription_id is not null then
        raise exception 'Campos administrativos e de pagamento não podem ser definidos pelo usuário.';
      end if;
    else
      if new.papel is distinct from old.papel
         or new.asaas_customer_id is distinct from old.asaas_customer_id
         or new.plano_status is distinct from old.plano_status
         or new.plano_asaas_subscription_id is distinct from old.plano_asaas_subscription_id then
        raise exception 'Campos administrativos e de pagamento não podem ser alterados pelo usuário.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on public.perfis;
create trigger protect_profile_privileged_fields
before insert or update on public.perfis
for each row execute function public.protect_profile_privileged_fields();
