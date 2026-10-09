# Tutorial de uso do ComercialAPP

Este guia descreve o fluxo disponível no aplicativo. Para instalar o ambiente,
consulte [Docker](DOCKER.md) ou [execução sem Docker](../README.md#sem-docker).
Use dados fictícios ao treinar ou produzir exemplos de documentação.

## Primeiro acesso

1. Entre com o usuário e a senha fornecidos pela administração. Se o ambiente
   estiver configurado para isso, use **Entrar com conta Microsoft**.
2. O menu mostra os recursos permitidos ao seu perfil. Administradores e gestores
   acessam todos os registros comerciais; vendedores acessam seus próprios
   registros. O perfil Consulta vê a lista de propostas sem valores e pode
   baixar documentos técnicos.
3. No menu inicial e na montagem da proposta, **Rever tutorial** abre o guia
   interativo da tela.

A administração cria a conta inicial pelo procedimento de instalação. Antes de
reservar números, o administrador ou gestor deve configurar a sequência em
**Acessos e numeração**, após conferir os códigos usados no CRM e no legado.
Depois de configurado, somente o administrador pode alterar o valor inicial.
Informe o novo número, confira os códigos do CRM e do legado e clique em
**Alterar numeração**. O diálogo mostra o próximo número da sequência atual e o
novo ponto de partida; a alteração só é salva ao clicar em **Confirmar alteração**.
Propostas existentes mantêm seus números e números já reservados são pulados.

## Levantar os custos

Abra **Levantar custos**. Escolha **Novo orçamento** para iniciar um levantamento
ou selecione um registro em **Custos em andamento** para continuar de onde parou.
O novo levantamento recebe seu número e fica salvo automaticamente nessa lista,
mesmo sem preencher nenhum campo.

| Seção | O que preencher e conferir |
| --- | --- |
| **Premissas** | Identificação e percentuais que participam da formação de preço. |
| **Mão de obra** | Fases, períodos, condições de trabalho, funções, equipe, jornadas, horas extras e despesas. |
| **Materiais e insumos** | Circuitos, dimensões, serviços, materiais, químicos, filtros e efluentes necessários. |
| **Logística** | Destinos, mobilização/desmobilização, transporte de equipe/equipamentos e despesas de viagem. |
| **Resumo e QQP** | Custo e preço resultantes, modo de precificação, comissões, indicações e opção de quadro de quantidades e preços. |

Os totais mudam durante o preenchimento. Use o rodapé e as mensagens de pendência
para localizar o que falta. Confirme explicitamente as opções de escopo quando
não houver insumos ou logística, conforme solicitado pelo formulário.

Na mão de obra, os dias úteis da permanência são calculados por
`5 * floor(dias corridos / 7) + min(dias corridos mod 7, 5)`,
considerando início na segunda-feira. Cada semana completa tem cinco dias de trabalho,
e os dias restantes contam até sexta-feira.
Por exemplo, 17 dias corridos têm 13 dias de segunda a sexta. Informar 5 dias de
integração mantém os 17 dias corridos e reduz os dias trabalhados para 8.
O custo de mão de obra inclui os 8 dias de execução e os 5 dias de integração.
Com uma diária de equipe de R$ 1.000, são R$ 8.000 de execução e R$ 5.000 de
integração, totalizando R$ 13.000.
A integração preserva a cobrança da jornada contratada e das despesas do período
completo, respeitando cargo, quantidade, alocação, turno e condição de trabalho.
Deslocamento hotel ↔ obra e despesas por pessoa, veículo ou mês incluem os dias
de integração. Os horários de execução continuam descontando a integração;
a divisão não reduz o orçamento nem o preço de venda. O valor reservado para
esses dias aparece separado na equipe e no QQP.
Alterar somente a integração atualiza os dias e horários automáticos sem alterar
o valor total. Alterar a duração, equipe, jornada ou despesas recalcula o orçamento. Dias ajustados
manualmente por cargo ou colaborador são preservados; clique em **Usar dias
calculados da fase** para voltar ao cálculo automático.

As edições são salvas automaticamente para continuar depois. Para concluir,
resolva as pendências,
confira o código apresentado e clique em **Salvar e criar proposta** no resumo.
O aplicativo salva o levantamento e abre a criação da proposta com ele vinculado,
aproveitando o número, os preços e os serviços. Um levantamento concluído também
pode ser selecionado posteriormente na criação da proposta.

Quando Maps estiver habilitado e a sede cadastrada, use as sugestões de endereço
e o cálculo de distância. Se o serviço estiver desligado ou não localizar o
destino com confiança, informe a distância manualmente.

## Montar a proposta

Abra **Propostas** e escolha o caminho:

- **Proposta avulsa** para cadastrar diretamente, sem levantamento.
- **Usar levantamento salvo** para selecionar um levantamento concluído. Se houver
  pendências, corrija-as no levantamento antes de continuar.
- **Revisar proposta** para reaproveitar uma proposta já registrada.
- **Revisar proposta legada** para registrar uma revisão de um número antigo,
  com o número e a revisão conferidos.

Escolha o modelo **Padrão** ou **Hidrojateamento** quando solicitado. O modelo
define matrizes e conteúdo dos documentos. Na revisão de uma proposta com dados
anteriores, o aplicativo reaproveita essas informações.

Ao voltar do levantamento de custos, uma proposta já salva com o mesmo código e
revisão é retomada com os dados do cliente e do consultor. Para começar com os dados
de um negócio do Prisma, use **Negócios liberados**; os negócios precisam ter sua
liberação enviada pelo Prisma ao ComercialAPP.

| Etapa | O que fazer |
| --- | --- |
| **Cliente** | Informe cliente, CNPJ, contato, e-mail, local da obra e responsáveis. Com Nectar habilitado, busque a empresa e escolha o contato para criar o vínculo com o CRM. |
| **Escopo** | Inclua os serviços, descrições e tópicos; acrescente tabelas/fotos e organize a ordem do conteúdo. |
| **Responsabilidades** | Confira as obrigações da contratada e da contratante e os equipamentos/ferramentas previstos. |
| **Prazos** | Defina atendimento, mobilização, integração, execução e jornada. |
| **Técnica** | Selecione os serviços técnicos, ajuste seus parâmetros e confira os textos e relatórios previstos. |
| **Comercial** | Confira preços, quantidades, pagamento, impostos, validade, stand-by e mobilização adicional. No modelo de hidrojateamento, confira os cenários onshore/offshore. |
| **Revisão** | Confira a prévia, inclua anexos, emita os documentos e finalize a proposta. |

Gestores e administradores podem cadastrar consultores em **Configurações →
Consultores de venda**, informando somente o **Nome completo**.
Os consultores cadastrados aparecem em uma tabela com os nomes e as ações
**Editar** e **Remover** ao lado. A remoção exige confirmação e retira o consultor das novas propostas;
as propostas anteriores e seus documentos permanecem no histórico.

Em **Cliente**, o campo **Consultor de Vendas** reúne esses nomes e os usuários
ativos do Comercial. O nome escolhido aparece na prévia e nos documentos, inclusive
na chave `{{consultor}}` dos modelos Word. O orçamentista é preenchido pelo login.

Ao criar uma proposta a partir de um levantamento, **Escopo** já recebe as tabelas
do dimensionamento de cada serviço, separadas por circuito e tipo de equipamento.
Você pode editar títulos, cabeçalhos e células, incluir ou remover linhas e
reordenar linhas, tabelas e serviços. Os ajustes ficam salvos na proposta.

Ao reabrir a proposta depois de alterar o levantamento, a verba importada acompanha
o novo preço se seus valores ainda estiverem intactos. Para atualizar preços já
editados ou detalhados, use **Atualizar preço pelo levantamento**: a ação substitui
os itens da tabela contratada por uma verba única. No hidrojateamento, a outra
tabela de cenário é preservada. Confira os itens na etapa **Comercial**.

Os prazos escritos na proposta descrevem as condições comerciais. Para recalcular
custos por duração ou jornada, ajuste esses dados no levantamento vinculado.

Em **Responsabilidades**, os campos **Item / escopo** e **Nota** quebram as linhas
e aumentam de altura conforme o texto, para mostrar o conteúdo completo.

Em **Comercial**, você pode marcar **Incluir tabela de equipamentos e outras despesas**
para cadastrar itens com descrição, quantidade e valor unitário. O total de cada
linha é calculado automaticamente. Essa tabela aparece apenas no documento comercial,
como informação para o cliente, e seus valores não entram no total da proposta,
no histórico ou no CRM. Ao desmarcar a opção, a tabela deixa de aparecer no documento;
os itens preenchidos ficam guardados para reutilização.

O documento comercial padrão apresenta o título **Proposta Comercial** e o nome
do orçamentista antes dos dados do cliente. No modelo de hidrojateamento, o
**Título da proposta**, informado em Escopo, aparece antes dos dados do cliente.
As condições de pagamento, observações e impostos mantêm os subitens dos modelos,
inclusive ao editar seus textos.

As abas do rascunho permitem consultar as etapas. O botão de salvar e avançar
valida os campos da etapa; a emissão verifica as pendências do conjunto. Um campo
preenchido pode ter formato inválido: confira a mensagem junto ao CNPJ ou e-mail.

## Emitir documentos e finalizar

1. Confira as prévias técnica e comercial, inclusive textos, tabelas e fotos.
   **Visualizar PDF** abre o documento gerado pelo modelo Word dentro do aplicativo,
   com a paginação e a formatação da emissão. Você pode baixar ou imprimir pelo visualizador.
2. Inclua os anexos enquanto a proposta estiver em rascunho. Fotos de escopo
   aceitam até 8 imagens por proposta e 1,5 MB por imagem processada.
3. Na revisão, em **Documentos e finalização**, clique em **Emitir PDF e DOCX**.
   O aplicativo salva a proposta e gera os quatro arquivos: técnico e comercial
   em cada formato.
4. Baixe e confira os arquivos. Cada download confere os dados, os modelos Word
   e o gerador; se houver alterações, o aplicativo atualiza os quatro arquivos
   antes de baixar o formato escolhido. Edições pendentes no rascunho são salvas
   antes da geração; sem edições, o download usa a proposta já salva. Se o
   salvamento falhar, a tela informa o motivo e interrompe o download.
   **Atualizar documentos** também permite forçar uma nova geração.
5. Clique em **Finalizar proposta** nas ações do topo ou do rodapé. O aplicativo
   valida todas as etapas, salva as alterações e emite os documentos atualizados
   antes de finalizar. Você também pode finalizar diretamente por esse botão,
   sem emitir os arquivos antes. O limite agregado é de 20 MB para os PDFs, o CSV
   de custos quando houver e os anexos. **Salvar rascunho** mantém a proposta
   aberta para continuar depois.

A finalização local funciona sem CRM, SharePoint ou Maps. Depois dela, use
**Editar proposta** no histórico ou na tela de documentos para reabrir o mesmo
registro como rascunho, sem criar uma revisão. Edite o conteúdo e finalize
novamente para emitir os documentos atualizados. Os arquivos anteriores e os
vínculos continuam salvos; arquivos já enviados às integrações mantêm a versão enviada.

## Revisar uma proposta feita no LEC

Em **Propostas**, escolha **Revisar proposta legada** e selecione a planilha LEC
1.2/1.3 em `.xlsm` ou `.xlsx`. Se os textos e o escopo foram completados no Word,
inclua também a proposta original em PDF. Os dois arquivos devem corresponder ao
mesmo número e à mesma revisão de origem, com até 10 MB cada. O PDF precisa ter
texto selecionável; imagens e assinaturas não são importadas.

Confira a prévia, informe uma revisão maior que a revisão de origem e escolha o
modelo. Se houver diferenças, escolha **Usar PDF** ou **Usar LEC** para cada campo;
o PDF vem selecionado por representar a proposta emitida. Confira também as
pendências indicadas na prévia antes de importar.

Clique em **Importar e revisar levantamento de custos**. A importação cria dois
rascunhos vinculados: levantamento e proposta. Revise Premissas, Mão de obra,
Materiais e insumos, Logística e Resumo e QQP. Despesas e fretes são importados
pelos valores salvos; produtos químicos mantêm a quantidade original em modo
manual. Dados ou confirmações ausentes permanecem pendentes para preenchimento.
O preço original fica como valor global; para formar um novo preço, altere essa
opção em **Resumo e QQP**. O custo do app é recalculado e eventuais diferenças
com o LEC são apresentadas para conferência.

Conclua os custos e abra a proposta para revisar Cliente, Escopo,
Responsabilidades, Prazos, Técnica e Comercial. Confira os documentos e finalize
normalmente. Os rascunhos permanecem disponíveis no histórico após sair ou
recarregar. Uma repetição da mesma importação retoma os registros sem substituir
edições. Números já usados por outras propostas são recusados; nesses casos, use
o histórico e **Revisar proposta**.

## Enviar e acompanhar as integrações

Os painéis da revisão mostram a disponibilidade e o estado de cada integração.
As opções de envio exigem uma proposta finalizada e a configuração correspondente.

- **Nectar CRM:** escolha um funil autorizado e confirme a empresa/contato.
  O envio inclui os PDFs, o CSV de custos se houver levantamento e os anexos.
  Uma nova tentativa reaproveita o vínculo existente. Digitar o cliente
  manualmente permite emitir localmente, mas não substitui o vínculo exigido
  para enviar ao Nectar.
- **SharePoint:** envie os arquivos para uma pasta dentro do destino autorizado.
- **Aprovação e FiltroAPP:** acompanhe aprovação, projeto e entrega. A aprovação
  pode vir de eventos do CRM ou da consulta ao Nectar. Administradores/gestores
  podem aprovar e vincular manualmente com justificativa quando necessário.
  A revisão recebida pode aguardar seleção no FiltroAPP.
- **Modo fake:** simula o comportamento para conferência; não representa envio
  aos serviços externos.

Se o envio falhar, os arquivos continuam salvos. Confira a mensagem do painel,
corrija a configuração ou o vínculo e tente novamente. Veja
[Nectar](NECTAR.md) e [Integrações externas](INTEGRACOES.md) para os requisitos.

## Retomar o trabalho e administrar

Em **Histórico**, busque por número, cliente ou descrição e navegue pelas páginas
de levantamentos e propostas. Abra um registro para retomar o rascunho ou
consultar a revisão. Baixe os documentos disponíveis na tabela. A visibilidade
dos registros e valores depende do perfil.

Para aplicar uma atualização dos modelos a uma proposta já emitida, clique em
**Regerar PDF e DOCX** na coluna **Documentos**. A ação usa os dados salvos e
recria os arquivos técnico e comercial, inclusive de propostas finalizadas,
mantendo número, revisão e status. Os arquivos anteriores são preservados;
se a geração falhar ou a proposta mudar durante o processo, os downloads
anteriores continuam disponíveis. Arquivos já enviados ao CRM ou SharePoint
continuam com a versão enviada.

O aplicativo oferece salvamento no servidor e recuperação de rascunho local.
Confira o indicador de salvamento antes de sair. Se aparecer um conflito de
edição, revise a versão mais recente antes de escolher como continuar.

Em **Acessos e numeração**, administradores/gestores criam usuários, alteram
perfis, ativam/desativam acessos e redefinem senhas locais dentro de suas
permissões. Em **Configurações**, cadastre o endereço da sede usado nas
distâncias. A **Central de API**, exclusiva do administrador, gera/revoga tokens
do CRM Prisma e valida eventos sem gravá-los. Guarde tokens no cofre de segredos;
eles não devem aparecer em tutoriais, capturas ou documentos.

## Arquivos do tutorial interativo

- [Roteiros da entrada, custos e proposta](../frontend/src/pages/comercial/roteiroDoTutorial.ts).
- [Componente que exibe os passos do tutorial](../frontend/src/pages/comercial/TutorialDoModulo.tsx).
- [Visão geral e índice dos guias](../README.md#documentação).
