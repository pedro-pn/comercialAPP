import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória para iniciar a API.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
