import AdmZip from 'adm-zip';

const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Synthetic LEC layout; no client data or VBA from the real example is checked in. */
export function lecFixture({ proposalCode = 7310, revisionNumber = 1, changes = {}, sharedStrings = false } = {}) {
  const sheets = {
    'GERAR PROPOSTA': { B5: 'Cód. Proposta', F5: 'Rev', D5: proposalCode, H5: revisionNumber,
      L5: 12345678000190, H7: 'Serviços industriais', I9: 'Empresa de Exemplo', D9: 46297,
      D11: 'Obra de exemplo', D13: 'Contato de Exemplo', D15: 'contato@example.com',
      B18: 'Orçamentista Anterior', J18: 'Consultor Exemplo', B21: 7, D21: 10, F21: 9, H21: 7, J21: 0, L21: 4,
      H32: 21, H34: 35, C34: 'Depósito em conta', C36: 250, H36: 4500, H38: 2500, C38: 0,
      B50: 195365.38, J46: 59235.189377, B53: 0.18 },
    'CUSTO.Colaboradores': { B12: 'Coordenadores', B6: 2, H9: 9, H10: 7,
      H15: 1, H16: 1, H18: 1, H19: 12, H20: 1, H21: 12, H22: 4,
      B38: 'Container', H38: 3500, B39: 'Locação de contador', H39: 19000,
      S45: 172.602739726, S46: 246.575342465 },
    'CUSTO.Produtos': { I27: 'Produto', I28: 'Filtro 18 polegadas', M28: 6, O28: 800,
      I29: 'Filtro 36 polegadas', M29: 6, O29: 1270, I8: 'Ácido cítrico', M8: 'kg', N8: 15.58, R8: 0 },
    'CUSTO.Frete': { B10: 'Item', G6: 1036, B15: 'Mob/Desmob Equipamentos - Frete', F15: 2, H15: 15540, N15: 7770 },
    'CUSTO.TOTAL': { K11: 65816.87708604714, K5: 0.007, K6: 0.078, T11: 0.181 },
    'CUSTO.Impostos': { D6: 0.1754, D9: 0.1811, D10: 0.05 },
    'Calculo Colaboradores': { D11: 4086.57, D12: 2395.37 }
  };
  for (const [name, values] of Object.entries(changes)) {
    if (values === null) delete sheets[name];
    else sheets[name] = { ...sheets[name], ...values };
  }
  const zip = new AdmZip();
  const names = Object.keys(sheets);
  const strings = [];
  zip.addFile('xl/workbook.xml', Buffer.from(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`));
  names.forEach((name, index) => {
    const cells = Object.entries(sheets[name]).map(([address, value]) => {
      if (typeof value === 'object') return `<c r="${address}" t="${value.type || 'n'}"><f>${escape(value.formula)}</f>${value.value === undefined ? '' : `<v>${escape(value.value)}</v>`}</c>`;
      if (typeof value === 'number') return `<c r="${address}"><v>${value}</v></c>`;
      if (sharedStrings) { strings.push(value); return `<c r="${address}" t="s"><v>${strings.length - 1}</v></c>`; }
      return `<c r="${address}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
    });
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row>${cells.join('')}</row></sheetData></worksheet>`));
  });
  if (sharedStrings) zip.addFile('xl/sharedStrings.xml', Buffer.from(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(value => `<si><t>${escape(value)}</t></si>`).join('')}</sst>`));
  return zip.toBuffer();
}

export const legacyProposalText = `
PROPOSTA N°: 7310 REV - 1
CLIENTE: Empresa de Exemplo
A/C: Contato de Exemplo
E-mail do solicitante: contato@example.com
Local da obra: Obra de exemplo
CNPJ: 12.345.678/0001-90
2 - Descrição dos serviços que serão executados:
  2.1 Serviço especializado em flushing primário:
    • 6 cilindros:
      o Diâmetro interno: 560 mm
    • 6 mangueiras:
      o Comprimento: 26 m
      o Diâmetro interno: 200 mm
  2.2 Filtragem absoluta em aproximadamente 32.000 litros de óleo MARCA EXEMPLO;
3 - Matriz geral de responsabilidade
  3.1 Responsabilidade da Filtrovali:
  Item                 ESCOPO                                                                    NOTA
EQUIPAMENTOS E FERRAMENTAS
         Fornecimento de equipamentos necessários, incluindo:
            o    1 Bomba de transferência
  3.1.1
            o    1 Container
  3.2 Responsabilidade do Contratante:
LOGÍSTICA
         - Hospedagem da equipe durante a obra;
  3.2.1
MEIO AMBIENTE
  3.2.2 - Destinação adequada dos resíduos;
4 - Previsão de atendimento:
  4.1 - 7 dias após pedido de compras.
5 - Prazo para execução dos serviços:
  5.1 Permanência de 9 dias corridos.
6 - Jornada de trabalho:
  Turno diurno, 12 horas trabalhadas, 1 hora de intervalo.
7 - Descrição dos valores:
  7.1 Serviço de flushing primário e filtragem absoluta.   R$ 195.365,38   1   R$ 195.365,38
  Total geral    R$ 195.365,38
  7.2 Serviço adicional sujeito a contratação separada: desidratação de óleo.
8 - Condições de pagamento:
  Pagamento integral após o encerramento dos serviços em 21 dias.
9 - Observações:
  Stand-by de Equipe        R$ 15.000,00
  Stand-by de Equipamentos  R$ 2.500,00
  Mobilização Extra         R$ 19.800,00
10 - Impostos:
  Impostos conforme condições da proposta de origem.
11 - Validade da proposta:
  10 dias após a emissão.
`;
