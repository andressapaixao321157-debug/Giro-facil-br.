# Configuração dos ambientes Asaas

O Giro Fácil mantém as credenciais dos dois ambientes no Supabase. **Novos checkouts e a Central Financeira usam um único ambiente ativo por vez**, escolhido explicitamente em `ASAAS_ENVIRONMENT`. O webhook recebe eventos dos dois ambientes e confere o ambiente gravado em cada pedido antes de atualizar qualquer pagamento.

## Secrets obrigatórios no Supabase

Em **Supabase Dashboard → Project → Edge Functions → Secrets**, configure:

- `ASAAS_ENVIRONMENT`: exatamente `sandbox` ou `production` (ambiente ativo para novas operações e consulta financeira)
- `ASAAS_API_KEY_SANDBOX`: chave privada do Asaas Sandbox
- `ASAAS_API_KEY_PRODUCTION`: chave privada do Asaas Produção
- `ASAAS_WEBHOOK_TOKEN_SANDBOX`: token secreto do webhook cadastrado no Asaas Sandbox
- `ASAAS_WEBHOOK_TOKEN_PRODUCTION`: token secreto do webhook cadastrado no Asaas Produção

Não coloque valores dessas chaves no GitHub, no aplicativo, em prints ou em mensagens.

## Webhooks

Cadastre a mesma URL nos dois ambientes Asaas:

`https://seimeqvtifxlkagudqus.supabase.co/functions/v1/asaas-webhook`

No webhook Sandbox, use `ASAAS_WEBHOOK_TOKEN_SANDBOX`. No webhook Produção, use `ASAAS_WEBHOOK_TOKEN_PRODUCTION`. O endpoint identifica qual token foi apresentado e só processa o pedido se o campo `payment_orders.asaas_environment` corresponder ao ambiente de origem.

## Troca do ambiente ativo

1. Defina `ASAAS_ENVIRONMENT=sandbox` durante os testes.
2. Faça e confira testes no Sandbox.
3. Antes de ir ao ar, confirme no painel Asaas qual conta/ambiente receberá cobranças reais.
4. Defina `ASAAS_ENVIRONMENT=production` somente após a conferência do proprietário.
5. Mantenha os dois tokens de webhook configurados para que pagamentos pendentes de ambos os ambientes possam ser processados com validação do ambiente do pedido.

## Pedidos anteriores à migração

A migração deixa `asaas_environment` como NULL nos pedidos já existentes, pois o ambiente histórico não pode ser inferido com segurança. Eventos desses pedidos não ativam anúncios, planos ou turbos automaticamente até que sejam conciliados e classificados com segurança. Não marque pedidos antigos como sandbox ou produção por suposição.

## Comportamento seguro

- Se `ASAAS_ENVIRONMENT` estiver ausente ou inválido, criação de checkout e Central Financeira recusam a operação.
- Se faltar a chave do ambiente ativo, a operação é recusada.
- A URL da API é derivada do ambiente; não existe fallback silencioso para produção.
- O webhook valida ambos os tokens e confere o ambiente gravado no pedido antes de processá-lo.
- O código não cria cobranças, pagamentos ou transferências durante o deploy.
