const routes: Record<string, string> = {
  index: '/',
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
