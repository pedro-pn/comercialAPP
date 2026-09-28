const routes: Record<string, string> = {
  index: '/',
  custos: '/custos',
  propostas: '/propostas',
  historico: '/historico',
  configuracoes: '/configuracoes'
};

export function moduleRoutePath(moduleId: 'comercial', routeKey: string) {
  if (moduleId !== 'comercial') throw new Error('Módulo desconhecido.');
  return routes[routeKey] || '/';
}
