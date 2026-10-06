import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";
import { createApiCredential } from "../src/auth/api-credentials.js";
import { sendFinalizedToPrisma } from "../src/comercial/prisma-delivery.js";
import { storeFile } from "../src/comercial/storage.js";

// Runs only with a disposable CommercialAPP database and an explicit Prisma checkout.
test(
  "Prisma ↔ ComercialAPP: liberação, dois PDFs, revisão, eventos e revogação",
  {
    skip: !process.env.TEST_DATABASE_URL || !process.env.PRISMA_SOURCE_DIR,
  },
  async (t) => {
    assert.equal(
      new URL(process.env.TEST_DATABASE_URL).pathname,
      "/comercialapp_test",
    );
    const source = process.env.PRISMA_SOURCE_DIR;
    const load = (relative) =>
      import(pathToFileURL(path.join(source, relative)).href);
    const { createContactConsolidationFixture } = await load(
      "scripts/verify-contact-consolidation.mjs",
    );
    const { handleComercialAppV2 } = await load("server/comercialapp-v2.mjs");
    const { deliverComercialAppRelease } = await load(
      "server/comercialapp-release.mjs",
    );
    const { deliverComercialAppCallback } = await load(
      "server/comercialapp-callback.mjs",
    );
    const f = await createContactConsolidationFixture();
    const db = createDatabase(process.env.TEST_DATABASE_URL);
    const dir = await mkdtemp(path.join(tmpdir(), "prisma-exchange-"));
    const old = Object.fromEntries(
      ["COMERCIAL_DIR", "PRISMA_API_URL", "PRISMA_API_TOKEN", "APP_ENV", "NODE_ENV"].map(
        (k) => [k, process.env[k]],
      ),
    );
    process.env.COMERCIAL_DIR = dir;
    process.env.APP_ENV = "test";
    process.env.NODE_ENV = "test";
    const token = "prisma_ca_" + "d".repeat(64);
    const api = (action, args = {}) =>
      f.one("SELECT public.drax_comercialapp_v2($1,$2,$3,$4) value", [
        token,
        "sandbox",
        action,
        args,
      ]);
    let commercial, prisma;
    t.after(async () => {
      if (commercial) await new Promise((r) => commercial.close(r));
      if (prisma) await new Promise((r) => prisma.close(r));
      await db.$disconnect();
      await f.db.close();
      await rm(dir, { recursive: true, force: true });
      for (const [k, v] of Object.entries(old)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    await f.migrate(
      "20260924011000_nectar_opportunity_number_reconciliation.sql",
    );
    await f.db.exec(
      "CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE sql AS $$SELECT sha256($1)$$;CREATE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$SELECT decode(repeat('ab',n),'hex')$$;",
    );
    for (const migration of [
      "20260930140000_comercialapp_ingest.sql",
      "20260930140100_comercialapp_callback.sql",
      "20260930180000_comercialapp_bearer_callback_contract.sql",
      "20261006120000_comercialapp_exchange_v2.sql",
    ])
      await f.migrate(migration);
    await f.q(
      "INSERT INTO drax_app.comercialapp_clients(tenant_id,environment,name,token_hash) VALUES('filtrovali','sandbox','Synthetic cross-system',extensions.digest($1,'sha256'))",
      [token],
    );
    await f.q("UPDATE drax_app.comercialapp_sandbox_fixtures SET deal=jsonb_set(deal,'{id}',to_jsonb($1::text)) WHERE environment='sandbox'",['qa-deal-'+randomUUID()]);
    const release = await api("sandbox_release", {
      request_id: randomUUID(),
      status: "ACTIVE",
    });
    const event = (
      await f.q("SELECT payload FROM drax_app.comercialapp_release_outbox")
    )[0].payload;
    const user = await db.user.create({
      data: {
        username: "exchange-" + randomUUID(),
        name: "Synthetic QA",
        role: "ADMIN",
      },
    });
    const releaseCredential = await createApiCredential(db, user, {
      name: "Synthetic releases",
      expiresInDays: 1,
      scopeCode: "crm.releases.write",
    });
    const statusCredential = await createApiCredential(db, user, {
      name: "Synthetic statuses",
      expiresInDays: 1,
      scopeCode: "crm.events.write",
    });
    commercial = createApp({
      commercialDb: db,
      authService: {},
      appOrigin: "http://localhost",
    }).listen(0, "127.0.0.1");
    await once(commercial, "listening");
    const base = "http://127.0.0.1:" + commercial.address().port;
    const post = (route, payload, credential) =>
      fetch(base + route, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + credential,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    assert.equal(
      (
        await post(
          "/api/integrations/crm/releases",
          event,
          statusCredential.token,
        )
      ).status,
      401,
    );
    const releaseJob = {
      eventId: event.eventId,
      url: "https://comercial.filtrovali.com.br/api/integrations/crm/releases",
      token: releaseCredential.token,
      payload: event,
    };
    const localTransport = (url, init) =>
      fetch(base + new URL(url).pathname, init);
    assert.equal(
      (await deliverComercialAppRelease(releaseJob, localTransport)).statusCode,
      202,
    );
    assert.equal(
      (await deliverComercialAppRelease(releaseJob, localTransport)).statusCode,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/integrations/crm/releases",
          { ...event, description: "Changed without new event" },
          releaseCredential.token,
        )
      ).status,
      409,
    );
    assert.equal(
      await db.crmReleaseEvent.count({
        where: { releaseId: release.releaseId },
      }),
      1,
    );
    // Real HTTP multipart adapter feeding the actual Prisma SQL transaction.
    prisma = createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request("http://127.0.0.1" + req.url, {
          method: req.method,
          headers: req.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        const response = await handleComercialAppV2(
          request,
          {
            url: "https://prismacrm.filtrovali.com.br",
            publishableKey: "synthetic",
          },
          async (_url, init) => {
            const input = JSON.parse(init.body);
            try {
              return Response.json(
                await f.one(
                  "SELECT public.drax_comercialapp_v2($1,$2,$3,$4) value",
                  [
                    input.p_token,
                    input.p_environment,
                    input.p_action,
                    input.p_args,
                  ],
                ),
              );
            } catch (e) {
              return Response.json({ code: e.code }, { status: 400 });
            }
          },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(500);
        res.end();
      }
    }).listen(0, "127.0.0.1");
    await once(prisma, "listening");
    process.env.PRISMA_API_URL =
      "http://127.0.0.1:" +
      prisma.address().port +
      "/api/comercialapp/v2/sandbox";
    process.env.PRISMA_API_TOKEN = token;
    const code = "QA-" + randomUUID().slice(0, 8),
      revisions = [];
    for (const rev of [0, 1]) {
      const p = await db.proposal.create({
        data: {
          proposalCode: code,
          revisionNumber: rev,
          clientName: event.legalName,
          cnpj: event.taxId,
          contact: event.contactName,
          email: event.email,
          site: event.site,
          sellerUserId: user.id,
          sellerName: user.name,
          estimatorName: user.name,
          payload: {},
          totalValue: 100,
          status: "FINALIZADA",
          finalizedAt: new Date(),
          createdByUserId: user.id,
          crmReleaseId: release.releaseId,
          crmClientId: release.clientId,
          crmOpportunityId: release.opportunityId,
          prismaProjectId: null,
        },
      });
      const generationId = randomUUID();
      for (const kind of ["TECNICA", "COMERCIAL"]) {
        const file = await storeFile(
          `${p.id}/${kind}.pdf`,
          Buffer.from("%PDF-1.4\nSynthetic " + kind + " " + rev),
        );
        await db.proposalDocument.create({
          data: {
            proposalId: p.id,
            generationId,
            payloadHash: "synthetic",
            kind,
            format: "PDF",
            ...file,
          },
        });
      }
      const sent = await sendFinalizedToPrisma(db, p.id);
      assert.equal(sent.status, "SUCESSO");
      assert.equal((await sendFinalizedToPrisma(db, p.id)).id, sent.id);
      // Simulate lost acknowledgement: same bytes and stable idempotency key must reuse the receipt.
      await db.proposal.update({
        where: { id: p.id },
        data: { prismaDeliveryStatus: "PENDENTE", prismaReceivedId: null },
      });
      assert.equal((await sendFinalizedToPrisma(db, p.id)).id, sent.id);
      revisions.push({ ...p, receivedId: sent.id });
    }
    assert.equal(
      await f.one(
        "SELECT count(*)::int value FROM drax_app.comercialapp_files",
      ),
      4,
    );
    assert.notEqual(revisions[0].receivedId, revisions[1].receivedId);
    const newest = revisions[1];
    const approved = await api("sandbox_status", {
      request_id: randomUUID(),
      id: newest.receivedId,
      status: "accepted",
      expected_sequence: 1,
    });
    await api("sandbox_status", {
      request_id: randomUUID(),
      id: newest.receivedId,
      status: "cancelled",
      expected_sequence: approved.sequence,
    });
    const callbacks = (
      await f.q(
        "SELECT payload FROM drax_app.comercialapp_callback_outbox ORDER BY sequence",
      )
    ).map((row) => row.payload);
    const sendStatus = (payload) =>
      deliverComercialAppCallback(
        {
          eventId: payload.eventId,
          url: "https://comercial.filtrovali.com.br/api/integrations/crm/events",
          token: statusCredential.token,
          payload,
        },
        localTransport,
      );
    assert.equal(
      (
        await post(
          "/api/integrations/crm/events",
          callbacks[0],
          releaseCredential.token,
        )
      ).status,
      401,
    );
    assert.equal((await sendStatus(callbacks[0])).statusCode, 202);
    assert.equal((await sendStatus(callbacks[1])).statusCode, 202);
    assert.equal((await sendStatus(callbacks[0])).statusCode, 200);
    assert.equal(
      (
        await post(
          "/api/integrations/crm/events",
          { ...callbacks[0], eventId: randomUUID() },
          statusCredential.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (await db.proposal.findUnique({ where: { id: newest.id } }))
        .crmApprovalStatus,
      "CANCELLED",
    );
    assert.equal(
      (await db.proposal.findUnique({ where: { id: revisions[0].id } }))
        .crmApprovalStatus,
      "PENDENTE",
    );
    assert.equal(
      await db.crmProposalEvent.count({ where: { proposalId: newest.id } }),
      2,
    );
    await api('sandbox_status',{request_id:randomUUID(),id:revisions[0].receivedId,status:'declined',expected_sequence:1});
    const rejected=await f.one("SELECT payload value FROM drax_app.comercialapp_callback_outbox WHERE payload->>'proposalId'=$1",[revisions[0].id]);
    assert.equal((await sendStatus(rejected)).statusCode,202);
    assert.equal((await db.proposal.findUnique({where:{id:revisions[0].id}})).crmApprovalStatus,'REJECTED');
    assert.equal((await db.proposal.findUnique({where:{id:newest.id}})).crmApprovalStatus,'CANCELLED');
    await api("sandbox_release", {
      request_id: randomUUID(),
      status: "REVOKED",
    });
    const revoked = (
      await f.q(
        "SELECT payload FROM drax_app.comercialapp_release_outbox ORDER BY version DESC LIMIT 1",
      )
    )[0].payload;
    assert.equal(
      (
        await post(
          "/api/integrations/crm/releases",
          revoked,
          releaseCredential.token,
        )
      ).status,
      202,
    );
    assert.equal(
      (await db.crmRelease.findUnique({ where: { id: release.releaseId } }))
        .status,
      "REVOKED",
    );
    assert.equal(
      (
        await post(
          "/api/integrations/crm/releases",
          { ...event, eventId: randomUUID() },
          releaseCredential.token,
        )
      ).status,
      409,
    );
    assert.equal(
      await f.one(
        "SELECT count(*)::int value FROM drax_app.comercialapp_files",
      ),
      4,
    );
    console.log("PRISMA_COMMERCIAL_FULL_CYCLE_OK");
  },
);
