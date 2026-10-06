# ComercialAPP

Aplicativo comercial da Filtrovali para levantar custos de serviços industriais,
montar propostas técnicas e comerciais, emitir documentos e acompanhar o envio,
a aprovação e o vínculo com projetos. Funciona com banco, arquivos, usuários e
sessões próprios. As regras comerciais foram extraídas do módulo Comercial do
FiltroAPP; a comunicação com outros sistemas acontece por APIs.

Para começar a usar, leia o [tutorial de uso](docs/TUTORIAL.md). Os guias de
instalação, operação e integrações estão no [índice da documentação](#documentação).

## Fluxo de trabalho

1. Entre com uma conta local ou com Microsoft, quando habilitado.
2. Crie um levantamento de custos ou comece uma proposta diretamente.
3. Preencha cliente, escopo, responsabilidades, prazos e condições técnicas e
   comerciais. Um levantamento concluído pode fornecer número, serviços e preços.
4. Confira a prévia, inclua fotos e anexos e emita os documentos técnico e
   comercial em PDF e DOCX.
5. Finalize a proposta para preservar a versão emitida. Os arquivos permanecem
   disponíveis no histórico.
6. Com as integrações configuradas, envie ao Nectar e ao SharePoint e acompanhe
   a aprovação e a entrega ao FiltroAPP.

## Recursos

### Levantamento de custos e formação de preço

O levantamento possui cinco seções: **Premissas**, **Mão de obra**, **Materiais
e insumos**, **Logística** e **Resumo e QQP**. Os totais são recalculados durante
o preenchimento e conferidos novamente no servidor ao salvar.

- Premissas de impostos, comissões, despesas comerciais, despesas indiretas
  (overhead) e margem.
- Mão de obra por fases, funções e alocações de equipe, com datas, jornadas,
  horas normais e extras, turno noturno, encargos, benefícios e despesas da fase.
  Contempla condições de trabalho na sede, em viagem e offshore.
- Dimensionamento de circuitos com tubulações, mangueiras, reservatórios,
  volumes de óleo e equipamentos, associando os serviços aos itens atendidos.
- Materiais, produtos químicos calculados por volume/concentração, embalagens,
  filtros e destinação de efluentes.
- Mobilização e desmobilização, múltiplos destinos, frete, veículos próprios ou
  alugados, transporte rodoviário ou aéreo, combustível, pedágios e hospedagem.
- Distâncias informadas manualmente ou calculadas por Google Maps, quando
  configurado, a partir da sede cadastrada pela gestão.
- Preço calculado a partir do custo ou preço global fechado, com apuração de
  custo direto, receita líquida, lucro e margem resultante.
- Comissão de representante sobre base líquida ou bruta e bônus de indicação.
- Quadro de quantidades e preços (**QQP**) opcional para a proposta.
- Validação de pendências por seção e salvamento de rascunhos ou levantamentos
  concluídos para uso posterior.

### Propostas técnicas e comerciais

- Criação avulsa, a partir de levantamento concluído, como revisão de proposta
  existente ou como primeira revisão de um número legado.
- Modelos **Padrão** e **Hidrojateamento**, com matrizes, jornadas e tabelas
  próprias; o modelo de hidrojateamento contempla preços onshore e offshore.
- Sete etapas: **Cliente**, **Escopo**, **Responsabilidades**, **Prazos**,
  **Técnica**, **Comercial** e **Revisão**.
- Dados do cliente, CNPJ, contato, e-mail, local da obra, consultor e orçamentista,
  com validação de preenchimento e formato.
- Busca de empresa e contato no Nectar para vincular a proposta ao CRM, quando
  essa integração estiver habilitada.
- Escopo com serviços, descrições, tópicos, tabelas e fotos; reordenação dos itens
  e blocos de conteúdo.
- Matriz de responsabilidades entre contratada e contratante, equipamentos,
  ferramentas, prazos de mobilização/execução e jornada de trabalho.
- Textos técnicos editáveis, parâmetros de serviço e indicação dos relatórios
  previstos no documento técnico.
- Itens de preço, quantidades, valores unitários, pagamento, impostos, validade,
  stand-by e mobilização adicional.
- Prévia paginada dos documentos técnico e comercial e geração de prévia PDF.

O catálogo técnico contempla flushing primário, secundário e com água;
filtragem de óleos hidráulico/lubrificante, térmico, diesel e de têmpera;
desidratação de óleo hidráulico/lubrificante e diesel; limpeza química;
teste hidrostático/pressão; limpeza interna de reservatório; boroscopia;
hidrojateamento; passagem de PIG e pré-engenharia.

### Documentos, fotos e anexos

- Emissão dos dois documentos em **PDF e DOCX**, usando os modelos Word do
  projeto e LibreOffice para a conversão em PDF.
- Armazenamento e download dos arquivos pelo aplicativo e pelo histórico,
  conforme as permissões do usuário.
- **Regerar PDF e DOCX** aplica os modelos atuais aos dados salvos, inclusive
  em propostas finalizadas, mantendo número, revisão e status. Os arquivos
  anteriores são preservados e a publicação exige os quatro novos documentos.
- Fotos de escopo otimizadas no navegador e validadas no servidor, com até
  **8 fotos por proposta** e **1,5 MB por foto processada**.
- Upload, download e remoção de anexos enquanto a proposta está em rascunho.
- Finalização local com documentos correspondentes à última versão salva.
  Na revisão, cada download confere os dados, os modelos Word e o gerador e
  atualiza os quatro arquivos quando necessário, preservando os anteriores.
  O conjunto de PDFs, CSV de custos quando houver e anexos deve caber em **20 MB**.
- CSV de custos enviado às integrações quando existe levantamento vinculado.
  A finalização preserva os dados desse levantamento para a entrega da proposta.
- Propostas finalizadas bloqueiam a edição; alterações comerciais seguem por
  uma nova revisão.

### Rascunhos, numeração e histórico

- Persistência no PostgreSQL, autoria e versões salvas, com salvamento automático
  dos rascunhos após sua criação no servidor.
- Recuperação de rascunho local no navegador, separada por conta, tela e proposta,
  e aviso ao sair com alterações pendentes.
- Detecção de conflito quando outra pessoa salva uma versão mais recente,
  permitindo revisar a decisão antes de substituir o conteúdo.
- Sequência de números configurada pela gestão e alterável pelo administrador
  mediante diálogo de confirmação. A reserva registra o autor, consome o número
  e evita reutilização, inclusive de números legados registrados no aplicativo.
- Revisões com reaproveitamento dos dados anteriores e do vínculo com o CRM.
- Histórico com busca, paginação, reabertura dos registros, download dos
  documentos emitidos e situação das integrações.
- API para arquivar e desarquivar levantamentos e propostas, preservando os
  registros no banco.
- Tutorial interativo disponível pelo botão **Rever tutorial** no menu inicial
  e na montagem da proposta.

### Acessos e administração

| Perfil | Permissões principais |
| --- | --- |
| **Administrador** | Todos os recursos comerciais, gestão de usuários e contas administrativas, numeração, sede e Central de API. |
| **Gestor** | Registros comerciais de todos os vendedores, usuários sem privilégio de administrador, numeração, sede e seleção manual de aprovação/projeto. |
| **Vendedor** | Cria e consulta seus próprios levantamentos e propostas, emite documentos e usa as integrações disponíveis. |
| **Consulta** | Consulta a lista de propostas sem valores e baixa documentos técnicos disponíveis. |

O login local usa usuário e senha. O login institucional Microsoft Entra pode
ser habilitado separadamente: novos usuários autorizados no Entra entram como
**Vendedor**; contas locais podem ser vinculadas para preservar o histórico.
A gestão pode alterar perfis, ativar/desativar contas e redefinir senhas locais.
Mudanças de acesso revogam as sessões do usuário. Somente administradores podem
atribuir ou alterar o perfil Administrador.

Em **Configurações**, gestores e administradores podem cadastrar consultores de
venda apenas pelo nome completo. Os nomes ficam disponíveis no campo da proposta.

A **Central de API** permite criar e revogar tokens para eventos do CRM Prisma,
consultar validade e uso e validar o contrato em um playground sem gravar eventos.
O segredo é exibido uma única vez; o banco armazena somente seu hash. Tokens
podem ter prazo de validade ou permanecer ativos até a revogação.

### Integrações

| Integração | O que faz | Condições de uso |
| --- | --- | --- |
| **Nectar CRM** | Busca empresa/contato, lista funis autorizados, cria ou reaproveita oportunidade e anexa PDFs, CSV de custos e anexos. Revisões reutilizam o vínculo e retentativas evitam cards duplicados. | Configuração no backend; modos `off`, `fake` e `real`. |
| **CRM Prisma** | Recebe eventos autenticados de aprovação/rejeição e vínculo com projeto, com contrato versionado e tratamento de eventos repetidos. | Token emitido por administrador na Central de API. |
| **FiltroAPP** | Entrega a proposta aprovada, escopo e resumo do levantamento ao Acompanhamento; consulta projetos e acompanha seleção da revisão e retentativas de entrega. | API receptora implantada, credenciais de serviço, aprovação e vínculo com projeto. |
| **SharePoint** | Arquiva PDFs, CSV de custos e anexos em uma pasta autorizada após a finalização. | Credenciais e destino configurados no backend; modos `off`, `fake` e `real`. |
| **Google Maps** | Sugere endereços, localiza a sede e calcula distâncias para a logística, com limites diários de consultas. | Chave e APIs configuradas no backend; modos `off`, `fake` e `real`. |

A emissão e a finalização local funcionam com as integrações desligadas. Falhas
externas preservam os documentos para download e nova tentativa. A aprovação pode
vir do CRM, de consulta/webhook do Nectar ou da seleção manual justificada pela
gestão. O uso real depende da configuração e homologação de cada ambiente; os
modos de simulação não comprovam uma entrega externa. Consulte os
[contratos e requisitos das integrações](docs/INTEGRACOES.md).

## Executar o projeto

### Com Docker

O [guia de Docker](docs/DOCKER.md) cobre a execução local e a implantação.
As imagens incluem frontend servido por Nginx, API Node, PostgreSQL e LibreOffice.

```bash
cp .env.example .env
# Configure uma senha aleatória em COMERCIAL_DB_PASSWORD antes de subir.
docker compose -f docker-compose.local.yml up -d --build
```

Abra <http://localhost:8086> e crie o primeiro administrador conforme o guia.
Para homologação isolada, siga [Staging](docs/STAGING.md).

### Sem Docker

Requisitos: **Node.js 22 compatível com as dependências**, npm, **PostgreSQL 16**
e LibreOffice (`soffice` no `PATH`) para emitir PDFs. As versões de referência
estão nas imagens Docker e no CI.

1. Crie um banco PostgreSQL exclusivo para o aplicativo e um usuário próprio.
2. Instale as dependências e prepare a configuração da API:

   ```bash
   npm ci
   cp backend/.env.example backend/.env
   ```

   Configure `DATABASE_URL` com as credenciais locais e mantenha
   `APP_ORIGIN=http://localhost:5174` para o Vite. O
   [exemplo do frontend](frontend/.env.example) permite ajustar o destino do proxy.
3. Gere o cliente Prisma e aplique as migrações:

   ```bash
   npm run db:generate --workspace @comercialapp/backend
   npm run db:migrate --workspace @comercialapp/backend
   ```

4. Crie o primeiro administrador com senha de pelo menos 12 caracteres, lida
   pela entrada padrão:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | npm run db:bootstrap-admin --workspace @comercialapp/backend -- admin "Administrador Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

   O bootstrap só funciona enquanto a tabela de usuários está vazia.
5. Em terminais separados, execute `npm run dev:api` e `npm run dev:web`.
6. Abra <http://localhost:5174>. A API escuta em `127.0.0.1:4300` por padrão;
   sua verificação de disponibilidade é `GET /api/health`.
7. Antes de reservar números, configure a sequência em **Acessos e numeração**,
   conferindo os códigos já usados no CRM e no legado.

### Comandos e verificação

| Comando | Finalidade |
| --- | --- |
| `npm run dev:api` | Compila as regras e inicia a API com recarga. |
| `npm run dev:web` | Inicia o frontend Vite. |
| `npm run build` | Compila as regras compartilhadas e o frontend. |
| `npm run check` | Compila, verifica as telas portadas, testa frontend/regras/backend e valida o esquema Prisma. |

Os testes de integração com banco exigem `TEST_DATABASE_URL` apontando para um
banco exclusivo chamado **`comercialapp_test`**, com as migrações aplicadas.
Sem essa variável, os testes de banco são pulados. O
[CI](.github/workflows/ci.yml) prepara essa base, executa `npm run check` e
valida os arquivos Compose e os scripts de backup.

## Estrutura do repositório

| Diretório | Conteúdo |
| --- | --- |
| [frontend](frontend/) | React, TypeScript e Vite; login, navegação e telas comerciais. |
| [frontend/src/assets/login](frontend/src/assets/login/) | Imagens do login; o build gera URLs com hash para atualizar o cache quando os arquivos mudam. |
| [backend](backend/) | Express, Prisma, PostgreSQL, autenticação, APIs, arquivos e integrações. |
| [shared/comercial](shared/comercial/) | Motor de custos, dimensionamento, catálogo técnico e regras dos documentos. |
| [shared/schemas](shared/schemas/) | Contratos e validações compartilhados. |
| [backend/models/comercial](backend/models/comercial/) | Modelos Word para as propostas técnicas e comerciais. |
| [deploy](deploy/) | Scripts de backup/restauração e exemplo de proxy. |
| [docs](docs/) | Tutoriais e guias de desenvolvimento e operação. |

## Documentação

| Guia | Conteúdo |
| --- | --- |
| [Tutorial de uso](docs/TUTORIAL.md) | Primeiro acesso, levantamento, proposta, documentos, histórico e integrações. |
| [Docker](docs/DOCKER.md) | Execução local, desenvolvimento e implantação com contêineres. |
| [Staging](docs/STAGING.md) | Homologação isolada com login local, Central de API do Prisma e conexões de saída desligadas. |
| [Login Microsoft](docs/MICROSOFT_LOGIN.md) | Registro Entra, certificado, vínculo de contas e permissões. |
| [Rascunhos e persistência](docs/RASCUNHOS.md) | Numeração, autoria, versões, conflitos, arquivos e rotas da API. |
| [Nectar CRM](docs/NECTAR.md) | Configuração, envio, vínculo de oportunidades e retentativas. |
| [Integrações externas](docs/INTEGRACOES.md) | Aprovação, eventos do Prisma, FiltroAPP, SharePoint e Google Maps. |
| [Backup](docs/BACKUP.md) | Cópia de banco/arquivos, Backblaze B2, agendamento e retenção. |
| [Restauração](docs/RESTORE.md) | Verificação das cópias, restauração e recuperação do ambiente. |
| [Extração do módulo](docs/EXTRACAO.md) | Proveniência, decisões e registro histórico da separação do FiltroAPP. |

Arquivos do tutorial interativo:
[roteiros por tela](frontend/src/pages/comercial/roteiroDoTutorial.ts) e
[componente do tutorial](frontend/src/pages/comercial/TutorialDoModulo.tsx).
Configurações de exemplo:
[Compose](.env.example), [staging](.env.staging.example),
[backend](backend/.env.example) e [frontend](frontend/.env.example).

## Informações sensíveis na documentação

Use somente dados fictícios, domínios reservados como `example.com` e marcadores
como `URL_DO_REPOSITORIO` e `USUARIO_DEPLOY` nos exemplos. Não inclua senhas,
tokens, chaves privadas, cookies, certificados de acesso, strings de conexão
reais, identificadores de contas/tenants, endereços da infraestrutura ou dados
reais de clientes, pessoas, propostas e custos em README, tutoriais ou outros
documentos versionados. Capturas de tela e arquivos de exemplo também precisam
ter esses dados removidos.

Preencha os valores reais somente no ambiente de execução ou no cofre de
segredos. Arquivos `.env`, armazenamento local e o diretório `secrets/` estão
ignorados pelo Git; os `.env.example` devem conter apenas marcadores ou valores
de desenvolvimento. Chaves do backend não devem ir para variáveis `VITE_*`,
pois elas são incluídas no frontend. Guarde backups, configurações preenchidas
e chaves do Entra fora da documentação e do repositório.
