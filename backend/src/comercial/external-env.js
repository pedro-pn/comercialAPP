const positiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const env = {
  sharepointMode: process.env.SHAREPOINT_MODE || 'off',
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID || '',
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  sharepointDriveId: process.env.SHAREPOINT_DRIVE_ID || '',
  sharepointSiteId: process.env.SHAREPOINT_SITE_ID || '',
  sharepointHostname: process.env.SHAREPOINT_HOSTNAME || '',
  sharepointSitePath: process.env.SHAREPOINT_SITE_PATH || '',
  sharepointBaseFolder: process.env.SHAREPOINT_BASE_FOLDER || '',
  mapsMode: process.env.GOOGLE_MAPS_MODE || 'off',
  mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  mapsMaxDia: positiveInt(process.env.GOOGLE_MAPS_MAX_DIA, 200),
  mapsMaxDiaSugestoes: positiveInt(process.env.GOOGLE_MAPS_MAX_DIA_SUGESTOES, 300)
};

for (const [name, mode] of [
  ['SHAREPOINT_MODE', env.sharepointMode],
  ['GOOGLE_MAPS_MODE', env.mapsMode]
]) {
  if (!['off', 'fake', 'real'].includes(mode)) {
    throw new Error(`${name} deve ser off, fake ou real.`);
  }
}

export default env;
