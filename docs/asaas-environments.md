# Configuração dos ambientes Asaas

O Giro Fácil mantém as duas credenciais armazenadas no Supabase, mas opera com **um ambiente ativo por vez**. Isso evita que o checkout e a Central Financeira usem ambientes diferentes.

## Secrets obrigatórios no Supabase

Em **Supabase Dashboard → Project → Edge Functions → Secrets**, configure:

- `ASAAS_ENVIRONMENT`: exatamente `sandbox` ou `production`
- `ASAAS_API_KEY_SANDBOX`: chave privada do Asaas Sandbox
- `ASAAS_API_KEY_PRODUCTION`: chave privada do Asaas Produção
- `ASAAS_WEBHOOK_TOKEN_SANDBOX`: token secreto cadastrado no webhook do Asaas Sandbox
- `ASAAS_WEBHOOK_TOKEN_PRODUCTION`: token secreto cadastrado no webhook do Asaas Produção

Não coloque valores dessas chaves no GitHub, no aplicativo, em prints ou em mensagens.

## Webhook

Cadastre no Asaas do ambiente ativo a URL:

`https://seimeqvtifxlkagudqus.supabase.co/functions/v1/asaas-webhook`

Configure o token de autenticação desse webhook para corresponder ao secret do ambiente ativo. O endpoint valida o token do ambiente selecionado.

## Troca de ambiente

1. Não troque o ambiente enquanto houver checkouts/pagamentos pendentes ou webhooks aguardados no ambiente atual.
2. Confirme no painel do Asaas que os pagamentos pendentes foram concluídos, cancelados ou expiraram.
3. Altere `ASAAS_ENVIRONMENT` para o outro ambiente.
4. Confirme que o webhook correspondente está cadastrado e ativo.
5. Faça um teste de checkout de baixo valor no Sandbox antes de ativar Produção.

**Importante:** a configuração seleciona apenas um ambiente por vez. Não altere `ASAAS_ENVIRONMENT` com cobranças pendentes no ambiente anterior: o webhook só aceita o token do ambiente selecionado. A seleção de produção deve ocorrer somente após a conferência manual do proprietário.

## Comportamento seguro

- Se `ASAAS_ENVIRONMENT` estiver ausente ou inválido, as funções recusam a operação.
- Se faltar a chave ou o token do ambiente selecionado, a operação é recusada.
- A URL da API é derivada do ambiente; não existe fallback silencioso para produção.
- O código não cria cobranças, pagamentos ou transferências durante o deploy.
