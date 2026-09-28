import { build } from 'esbuild';

await build({
  entryPoints: [
    'src/pages/comercial/ComercialPage.tsx',
    'src/pages/comercial/custos/CustosPage.tsx',
    'src/pages/comercial/proposta/PropostaPage.tsx',
    'src/pages/comercial/historico/HistoricoPage.tsx',
    'src/pages/comercial/configuracoes/ConfiguracoesPage.tsx'
  ],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  outdir: 'dist-port-check',
  write: false
});
