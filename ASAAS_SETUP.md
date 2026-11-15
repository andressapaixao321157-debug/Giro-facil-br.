# Integração de pagamentos Asaas — Giro Fácil BR

A integração usa Supabase Edge Functions. A chave privada do Asaas e a service role do Supabase nunca ficam no HTML.

## 1. Executar o SQL

No Supabase, abra **SQL Editor**, cole e execute o arquivo `asaas_payments_setup.sql` deste repositório.

## 2. Configurar os segredos das Edge Functions

No terminal com Supabase CLI instalado e o projeto vinculado:

```bash
supabase secrets set ASAAS_API_KEY="SUA_CHAVE_API_ASAAS"
supabase secrets set ASAAS_API_URL="https://api-sandbox.asaas.com/v3"
supabase secrets set ASAAS_WEBHOOK_TOKEN="GERE_UM_TOKEN_ALEATORIO_COM_32_OU_MAIS_CARACTERES"
supabase secrets set ASAAS_SINGLE_AD_PRICE="10.00"
supabase secrets set ASAAS_MONTHLY_PLAN_PRICE="59.00"
```

Use valores numéricos em reais, por exemplo `12.90`, sem símbolo de moeda. Os preços confirmados são R$ 10,00 por anúncio avulso e R$ 59,00 por mês. Os valores também estão definidos como padrão no código, mas configure os segredos abaixo para fixá-los no ambiente. Para produção, troque `ASAAS_API_URL` por `https://api.asaas.com/v3` e use a chave de API de produção.

## 3. Publicar as funções

```bash
supabase functions deploy asaas-create-payment
supabase functions deploy asaas-webhook --no-verify-jwt
```

A função de criação exige sessão autenticada. O webhook valida o cabeçalho `asaas-access-token` com `ASAAS_WEBHOOK_TOKEN`.

## 4. Configurar o webhook no painel Asaas

Cadastre um webhook com a URL:

`https://seimeqvtifxlkagudqus.supabase.co/functions/v1/asaas-webhook`

Informe exatamente o mesmo token configurado em `ASAAS_WEBHOOK_TOKEN` no campo Auth Token e selecione os eventos:
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_REFUNDED`
- `PAYMENT_PARTIALLY_REFUNDED`

A aplicação usa o ID do evento para evitar processamento duplicado. O pagamento só libera a modalidade depois de confirmação recebida pelo webhook.

## 5. Homologação

Comece no Sandbox. Teste PIX e boleto para anúncio avulso e plano mensal. Só depois de validar todos os eventos, configure a chave e URL de produção.
