export function propostaCompleta(overrides = {}) {
  return {
    date: '2026-10-06', seller: 'Consultor de teste', client: 'Cliente de teste',
    cnpj: '11.222.333/0001-81', contact: 'Contato', email: 'cliente@example.com', site: 'Local de teste',
    title: 'Serviço de teste', scopeItems: [{ title: 'Serviço', description: 'Escopo' }],
    rows: [{ item: 'Equipe', owner: 'Filtrovali', categoria: 'Equipe' }],
    attendance: '10 dias', mobilization: '2 dias', permanence: '5 dias', integration: '1 dia', execution: '3 dias',
    workday: '8 horas por dia', technicalServices: [{ id: 'limpeza_quimica', serviceId: 'limpeza_quimica' }],
    prices: [{ description: 'Serviço', quantity: '1', unitValue: 'R$ 100,00', value: 'R$ 100,00' }],
    payment: '30 dias', taxes: 'Inclusos', overtimeRate: 'R$ 250,00', standbyTeam: 'R$ 2.250,00',
    standbyTeamQuantity: '1', standbyEquipment: 'R$ 1.000,00', extraMobilization: 'R$ 500,00', validity: '10',
    ...overrides
  };
}
