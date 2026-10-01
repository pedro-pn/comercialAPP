export function readRuntimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const staging = env.APP_ENV === 'staging';
  const appOrigin = env.APP_ORIGIN ?? (production || staging ? null : 'http://localhost:5174');
  const additionalOrigins = production || staging ? [] : (env.APP_ADDITIONAL_ORIGINS ?? '')
    .split(',').map(value => value.trim()).filter(Boolean);

  if (!appOrigin) throw new Error('APP_ORIGIN é obrigatória em produção e staging.');
  const parsedOrigin = new URL(appOrigin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== appOrigin) {
    throw new Error('APP_ORIGIN deve conter apenas uma origem HTTP ou HTTPS, sem caminho ou barra final.');
  }
  if (production && !staging && parsedOrigin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN deve conter apenas a origem HTTPS pública em produção.');
  }
  for (const origin of additionalOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('APP_ADDITIONAL_ORIGINS deve conter apenas origens HTTP ou HTTPS válidas.');
    }
  }

  return {
    production, staging, appOrigin, additionalOrigins,
    secureCookies: parsedOrigin.protocol === 'https:',
    sessionCookieName: staging ? 'comercial_staging_session' : 'comercial_session'
  };
}
