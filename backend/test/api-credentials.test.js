import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticateApiCredential, createApiCredential, listApiCredentials,
  revokeApiCredential } from '../src/auth/api-credentials.js';
import { previewCrmEvent, recordCrmEvent } from '../src/comercial/crm-bridge.js';

function fakeCredentialDb() {
  const records = new Map();
  return {
    records,
    apiCredential: {
      async create({ data }) {
        const record = { id: randomUUID(), createdAt: new Date(), revokedAt: null,
          revokedByUserId: null, lastUsedAt: null, useCount: 0, ...data };
        records.set(record.id, record);
        return record;
      },
      async findMany() { return [...records.values()]; },
      async findUnique({ where }) {
        return where.id ? records.get(where.id) || null :
          [...records.values()].find(record => record.selector === where.selector) || null;
      },
      async updateMany({ where, data }) {
        const record = records.get(where.id);
        if (!record || where.revokedAt === null && record.revokedAt ||
          where.OR && record.expiresAt && record.expiresAt <= where.OR[1].expiresAt.gt) {
          return { count: 0 };
        }
        const { useCount, ...changes } = data;
        Object.assign(record, changes);
        if (useCount?.increment) record.useCount += useCount.increment;
        return { count: 1 };
      }
    }
  };
}

test('token só aparece na emissão, autentica e deixa de funcionar ao revogar', async () => {
  const db = fakeCredentialDb();
  const admin = { id: 'admin', role: 'ADMIN' };
  const issued = await createApiCredential(db, admin, { name: 'CRM Prisma', expiresInDays: 90 });
  assert.match(issued.token, /^cma_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(await listApiCredentials(db)).includes(issued.token), false);
  assert.equal(JSON.stringify([...db.records.values()]).includes(issued.token), false);
  assert.equal((await authenticateApiCredential(db, issued.token)).id, issued.credential.id);
  assert.equal(db.records.get(issued.credential.id).useCount, 1);
  await assert.rejects(() => authenticateApiCredential(db, issued.token + 'x'), { status: 401 });
  db.records.get(issued.credential.id).expiresAt = new Date(Date.now() - 1000);
  await assert.rejects(() => authenticateApiCredential(db, issued.token), { status: 401 });
  db.records.get(issued.credential.id).expiresAt = new Date(Date.now() + 1000);
  await revokeApiCredential(db, admin, issued.credential.id);
  await assert.rejects(() => authenticateApiCredential(db, issued.token), { status: 401 });
});

test('token sem vencimento continua válido até a revogação', async () => {
  const db = fakeCredentialDb();
  const admin = { id: 'admin', role: 'ADMIN' };
  const issued = await createApiCredential(db, admin, {
    name: 'CRM Prisma permanente', expiresInDays: null
  });
  assert.equal(issued.credential.expiresAt, null);
  assert.equal((await listApiCredentials(db))[0].expiresAt, null);
  assert.equal((await authenticateApiCredential(db, issued.token)).id, issued.credential.id);
  await revokeApiCredential(db, admin, issued.credential.id);
  await assert.rejects(() => authenticateApiCredential(db, issued.token), { status: 401 });
});

test('playground não escreve e evento Prisma vincula a oportunidade sem Nectar', async () => {
  const proposal = { id: 'proposal-1', proposalCode: '8700', revisionNumber: 0,
    status: 'FINALIZADA', nectarStatus: 'PENDENTE', nectarOpportunityId: null,
    crmOpportunityId: null, crmApprovalAt: null, crmProjectId: null, filtroStatus: 'PENDENTE' };
  const events = new Map();
  const db = {
    proposal: {
      async findUnique() { return proposal; },
      async updateMany({ data }) { Object.assign(proposal, data); return { count: 1 }; }
    },
    crmProposalEvent: {
      async findUnique({ where }) { return events.get(where.eventId) || null; },
      async create({ data }) { events.set(data.eventId, data); return data; }
    },
    async $transaction(callback) { return callback(this); }
  };
  const event = { eventId: randomUUID(), proposalCode: '8700', revisionNumber: 0,
    opportunityId: 'prisma-123', approvalStatus: 'APPROVED', projectId: 'projeto-1',
    occurredAt: new Date().toISOString() };
  assert.equal((await previewCrmEvent(db, event)).valid, true);
  assert.equal(events.size, 0);
  assert.equal(proposal.crmApprovalAt, null);
  assert.equal((await recordCrmEvent(db, event, 'PRISMA')).duplicate, false);
  assert.equal(proposal.crmOpportunityId, 'prisma-123');
  assert.equal(events.get(event.eventId).source, 'PRISMA');
  assert.equal((await recordCrmEvent(db, event, 'PRISMA')).duplicate, true);
  await assert.rejects(() => previewCrmEvent(db, { ...event, eventId: randomUUID(),
    opportunityId: 'outra-oportunidade', occurredAt: new Date(Date.now() + 1000).toISOString() }),
  { status: 409 });
});
