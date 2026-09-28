# comercialAPP

Aplicativo Comercial independente da Filtrovali. Esta branch main começou limpa
em 28/09/2026. O aplicativo antigo em Next/Cloudflare está preservado na branch
legacy-next-cloudflare; ele não é a base desta implementação.

O módulo Comercial do FiltroAPP é a origem funcional da extração. A primeira
etapa traz sua biblioteca de regras e cria frontend e API executáveis em um
repositório próprio. As telas, a persistência e as integrações ainda serão
extraídas. Não use este esqueleto para propostas reais.

## Executar localmente

Requer Node.js e npm compatíveis com as dependências declaradas.

1. Execute npm install na raiz.
2. Em um terminal, execute npm run dev:api.
3. Em outro terminal, execute npm run dev:web.
4. Abra http://localhost:5174. A página mostra o estado da API local.
5. Execute npm run check para compilar frontend e regras e verificar a API.

O backend escuta em 127.0.0.1:4300 por padrão. As variáveis de exemplo estão
em backend/.env.example e frontend/.env.example. Nenhuma credencial de produção
é necessária para este esqueleto.

## Estrutura

- frontend: React e Vite, com origem própria.
- backend: Express, com a rota de saúde /api/health.
- shared/comercial: regras copiadas do módulo Comercial atual do FiltroAPP.
- docs/EXTRACAO.md: proveniência, decisões e próximas etapas.

## Decisões de produto

- Repositório remoto privado: será criado pelo proprietário; não há remoto local.
- Produção: comercial.filtrovali.com.br na mesma VPS do FiltroAPP, sob outro
  usuário do sistema e com banco próprio.
- Primeira entrega: login próprio; o gestor do Comercial administra acessos
  e papéis. Login compartilhado fica para uma etapa futura.
- Integração: Comercial envia propostas ao CRM, que escolhe o projeto e envia
  proposta e vínculo ao FiltroAPP. A aprovação vem do CRM, com seleção manual
  quando não houver retorno.
- Numeração: o Comercial emite números automaticamente a partir de um valor
  inicial configurado.

O valor inicial, a regra de seleção manual e os contratos do CRM ainda precisam
ser fechados antes da integração real. O esqueleto não acessa banco, CRM nem
infraestrutura de produção.
