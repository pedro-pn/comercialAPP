# Integração com Nectar CRM

O envio ao Nectar acontece depois de emitir os dois PDFs e finalizar a proposta
localmente. A tela de revisão permite escolher um funil autorizado, buscar a
empresa e o contato no Nectar e enviar. O card recebe os dois PDFs, o CSV de
custos quando existe levantamento vinculado e os anexos da proposta. Uma
revisão usa o card vinculado à proposta anterior.

## Configuração

O Docker lê o `.env` da raiz; a API executada diretamente lê `backend/.env`.
Os respectivos arquivos `.env.example` contêm:

| Variável | Uso |
| --- | --- |
| `NECTAR_MODE` | `off` (padrão), `fake` (simulação sem rede) ou `real` (API do Nectar). |
| `NECTAR_API_TOKEN` | Token criado em Configurações → Integrações no Nectar. |
| `NECTAR_PIPELINE_IDS` | IDs dos funis autorizados, separados por vírgula. Vazio bloqueia envio. |
| `NECTAR_RESPONSAVEL_ID` | ID numérico do responsável pela oportunidade. |

Para testar sem chamadas externas, configure `NECTAR_MODE=fake` e um ID em
`NECTAR_PIPELINE_IDS` (por exemplo, `44`). A busca exibirá a empresa e o contato
de teste. O resultado `SIMULADO` não marca a proposta como enviada, então o
mesmo registro poderá ser usado depois com `real`.

Para habilitar `real`, configure o token, o ID do responsável e somente os IDs
dos funis aprovados. Recrie a API (`docker compose -f docker-compose.local.yml
up -d --build api` no ambiente local). O token permanece apenas no backend.
Confira também os IDs do mapa de produtos em
`backend/src/lib/comercial/nectar-produtos.js` antes do primeiro envio real.

O Nectar usa a API v1 em `https://app.nectarcrm.com.br/crm/api/1/`; o token vai
no cabeçalho `Access-Token`. Veja a [documentação do Nectar](https://ajuda.nectarcrm.com.br/hc/pt-br/articles/5604437715475-Integra%C3%A7%C3%B5es-API).
O envio real ao Funil de testes foi validado em 29/09/2026; veja o fluxo de
aprovação em [Integrações externas](INTEGRACOES.md).

## Retentativas

Se o card for criado e a anexação falhar, o ID é salvo no banco. A próxima
tentativa reaproveita esse card. Se a resposta da criação se perder, a API
consulta o Nectar pelo nome da proposta, funil e empresa antes de criar outra.
Uma tentativa em andamento impede outra simultânea; após dois minutos, uma
tentativa interrompida pode ser refeita. Após sucesso, o envio é idempotente.

Os PDFs continuam disponíveis no histórico se o CRM falhar. A aprovação pode
ser consultada na API do Nectar ou recebida por webhook autenticado. O vínculo
ao projeto pode vir de um campo personalizado da oportunidade ou ser escolhido
manualmente pelo gestor do Comercial. A entrega ao FiltroAPP exige a implantação
do receptor descrito em [Integrações externas](INTEGRACOES.md).
