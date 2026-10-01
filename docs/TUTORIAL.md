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
ou selecione um registro em **Orçamentos salvos** para continuar de onde parou.

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

Salve o rascunho para continuar depois. Para concluir, resolva as pendências e
confira o código apresentado. Um levantamento concluído pode ser selecionado na
criação da proposta, aproveitando o número, os preços e os serviços vinculados.

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

| Etapa | O que fazer |
| --- | --- |
| **Cliente** | Informe cliente, CNPJ, contato, e-mail, local da obra e responsáveis. Com Nectar habilitado, busque a empresa e escolha o contato para criar o vínculo com o CRM. |
| **Escopo** | Inclua os serviços, descrições e tópicos; acrescente tabelas/fotos e organize a ordem do conteúdo. |
| **Responsabilidades** | Confira as obrigações da contratada e da contratante e os equipamentos/ferramentas previstos. |
| **Prazos** | Defina atendimento, mobilização, integração, execução e jornada. |
| **Técnica** | Selecione os serviços técnicos, ajuste seus parâmetros e confira os textos e relatórios previstos. |
| **Comercial** | Confira preços, quantidades, pagamento, impostos, validade, stand-by e mobilização adicional. No modelo de hidrojateamento, confira os cenários onshore/offshore. |
| **Revisão** | Confira a prévia, inclua anexos, emita os documentos e finalize a proposta. |

As abas do rascunho permitem consultar as etapas. O botão de salvar e avançar
valida os campos da etapa; a emissão verifica as pendências do conjunto. Um campo
preenchido pode ter formato inválido: confira a mensagem junto ao CNPJ ou e-mail.

## Emitir documentos e finalizar

1. Confira as prévias técnica e comercial, inclusive textos, tabelas e fotos.
2. Inclua os anexos enquanto a proposta estiver em rascunho. Fotos de escopo
   aceitam até 8 imagens por proposta e 1,5 MB por imagem processada.
3. Na revisão, em **Documentos e finalização**, clique em **Emitir PDF e DOCX**.
   O aplicativo salva a proposta e gera os quatro arquivos: técnico e comercial
   em cada formato.
4. Baixe e confira os arquivos. Se editar a proposta, use **Atualizar documentos**
   antes de finalizar.
5. Clique em **Finalizar proposta**. A finalização exige documentos atualizados
   e limite agregado de 20 MB para os PDFs, o CSV de custos quando houver e os
   anexos.

A finalização local funciona sem CRM, SharePoint ou Maps. Depois dela, os dados
da proposta ficam bloqueados para edição; use uma nova revisão para alterar o
conteúdo. Os documentos continuam disponíveis no histórico.

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
