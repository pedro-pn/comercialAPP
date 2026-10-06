const routes: Record<string, string> = {
  index: '/',
  liberacoes: '/liberacoes',
  custos: '/custos',
  propostas: '/propostas',
  historico: '/historico',
  acessos: '/acessos',
  api: '/api-central',
  configuracoes: '/configuracoes'
};

export function moduleRoutePath(moduleId: 'comercial', routeKey: string) {
  if (moduleId !== 'comercial') throw new Error('Módulo desconhecido.');
  return routes[routeKey] || '/';
}
