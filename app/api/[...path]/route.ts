import { NextRequest } from "next/server";
import { z } from "zod";
import * as service from "../../../lib/services";
import { get, put } from "../../../lib/store";
import { CATEGORY_LABELS } from "../../../lib/domain";
import { monitorAuthorized, monitorStep } from "../../../lib/monitor";
import { answerQuestion, modelStatus } from "../../../lib/answer-service";
import { callContext, compareCalls } from "../../../lib/comparison-service";
import {
  buildCompanyPage,
  getOrBuildCompanyPage,
} from "../../../lib/company-page";
import { drainJobs, workerStatus } from "../../../lib/background-jobs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function user(request: Request) {
  const trusted = request.headers.get("oai-authenticated-user-id");
  if (trusted) return trusted;
  const id = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)finn_visitor=([a-f0-9-]{36})(?:;|$)/)?.[1];
  return "visitor:" + (id ?? crypto.randomUUID());
}
function visitorResponse(u: string) {
  return (data: unknown, status = 200) => {
    const response = json(data, status);
    if (u.startsWith("visitor:"))
      response.headers.set(
        "Set-Cookie",
        `finn_visitor=${u.slice(8)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      );
    return response;
  };
}
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace("/api/", ""),
      u = user(request);
    const reply = visitorResponse(u);
    if (path === "health")
      return reply({
        status: "ok",
        application: "FINN",
        engine: modelStatus().configured ? "grounded-synthesis" : "extractive",
        model: modelStatus(),
        time: new Date().toISOString(),
      });
    if (path === "dashboard") return reply(await service.dashboard(u));
    if (path === "worker-instructions")
      return reply({
        version: "worker-runbook-v1",
        purpose:
          "Advance already queued research and refresh portfolios whose owners enabled monitoring. Do not create subscriptions or request model answers.",
        access:
          "Read this Site with Sites get_site. Obtain its existing siwc_bypass_bearer_token in memory; never print or store it. Send it only to this same Site, in both OAI-Sites-Authorization and X-FINN-Service-Authorization, each as Bearer plus the token. If unavailable or HTTP 401/403, stop and report the configuration failure; do not rotate credentials or change audience.",
        steps:
          "POST /api/worker with JSON {}. Repeat sequentially while ready > 0, stopping on busy, ready = 0, after 24 calls, or after 4 minutes. On HTTP 429 or 5xx retry once after 5 seconds, then stop. Jobs persist for the next run. Never call visitor job-step endpoints.",
        verification:
          "GET /api/worker-status and verify lastSeen advanced. Report only aggregate counts and failures, no credentials or visitor records.",
      });
    if (path === "worker-status") return reply(await workerStatus());
    if (path === "company-page")
      return reply({
        page: await buildCompanyPage(
          z.string().min(1).max(24).parse(url.searchParams.get("symbol")),
          z
            .string()
            .datetime({ offset: true })
            .optional()
            .parse(url.searchParams.get("asOf") ?? undefined),
        ),
        worker: await workerStatus(),
      });
    if (path === "comparison") {
      const symbol = z
        .string()
        .min(1)
        .max(24)
        .parse(url.searchParams.get("symbol"));
      const asOf = z
        .string()
        .datetime({ offset: true })
        .optional()
        .parse(url.searchParams.get("asOf") ?? undefined);
      return reply(await callContext(symbol, asOf));
    }
    if (path === "companies") {
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      return reply(
        service.companies
          .filter(
            (c) =>
              c.symbol.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q),
          )
          .sort(
            (a, b) =>
              Number(b.symbol.toLowerCase() === q) -
              Number(a.symbol.toLowerCase() === q),
          )
          .slice(0, 12),
      );
    }
    if (path === "research") {
      const symbol = z
        .string()
        .min(1)
        .max(24)
        .parse(url.searchParams.get("symbol"));
      const question = (
        url.searchParams.get("q") ?? "business revenue growth guidance margins"
      ).slice(0, 500);
      const asOf = z
        .string()
        .datetime({ offset: true })
        .optional()
        .parse(url.searchParams.get("asOf") ?? undefined);
      return reply({
        ...(await service.research(symbol, question, asOf)),
        model: modelStatus(),
      });
    }
    if (path.startsWith("jobs/")) {
      const job = await get<service.Job>("job", path.split("/")[1]);
      return job?.user === u
        ? json(job)
        : json({ error: "Job not found" }, 404);
    }
    if (path === "filing-evidence")
      return reply(
        await service.filingEvidence(
          z.string().min(1).max(120).parse(url.searchParams.get("id")),
        ),
      );
    if (path === "documents")
      return reply(
        await service.documents(url.searchParams.get("symbol") ?? "INFY"),
      );
    if (path === "evidence")
      return reply(
        (await service.passages(url.searchParams.get("symbol") ?? "INFY"))
          .filter(
            (p) =>
              !url.searchParams.get("document") ||
              p.documentId === url.searchParams.get("document"),
          )
          .slice(0, 50),
      );
    return reply({ error: "Not found" }, 404);
  } catch (e: unknown) {
    return json(
      { error: e instanceof Error ? e.message : "Request failed" },
      400,
    );
  }
}
const ruleSchema = z.object({
  priceThreshold: z.number().min(0.1).max(30),
  volumeMultiplier: z.number().min(1).max(20),
  categories: z.array(z.string().refine((v) => v in CATEGORY_LABELS)).max(20),
  monitorEnabled: z.boolean().optional(),
});
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace("/api/", ""),
      u = user(request);
    const reply = visitorResponse(u);
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      return reply({ error: "Cross-origin writes are not allowed" }, 403);
    if (Number(request.headers.get("content-length")) > 8000)
      return reply({ error: "Request too large" }, 413);
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 8000) return reply({ error: "Request too large" }, 413);
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (path === "worker") {
      if (!(await monitorAuthorized(request)))
        return reply({ error: "Worker authorization required" }, 403);
      return reply(await drainJobs());
    }
    if (path === "company-page") {
      const input = z
        .object({
          symbol: z.string().min(1).max(24),
          asOf: z.string().datetime({ offset: true }).optional(),
          force: z.boolean().default(false),
        })
        .strict()
        .parse(body);
      const result = await getOrBuildCompanyPage(
        u,
        input.symbol,
        input.asOf,
        input.force,
      );
      return reply(result, result.job ? 202 : 200);
    }
    if (path === "monitor") {
      if (!(await monitorAuthorized(request)))
        return reply({ error: "Monitor authorization required" }, 403);
      const { jobId } = z
        .object({ jobId: z.string().uuid().optional() })
        .parse(body);
      return reply(await monitorStep(jobId));
    }
    if (path === "answer") {
      const input = z
        .object({
          symbol: z.string().min(1).max(24),
          question: z.string().trim().min(3).max(500),
          asOf: z.string().datetime({ offset: true }).optional(),
        })
        .parse(body);
      return reply(
        await answerQuestion(u, input.symbol, input.question, input.asOf),
      );
    }
    if (path === "comparison") {
      const input = z
        .object({
          symbol: z.string().min(1).max(24),
          asOf: z.string().datetime({ offset: true }).optional(),
          focus: z
            .enum(["guidance", "demand", "investment"])
            .default("guidance"),
          earlierId: z.string().max(120).optional(),
          laterId: z.string().max(120).optional(),
        })
        .strict()
        .parse(body);
      return reply(
        await compareCalls(
          u,
          input.symbol,
          input.asOf,
          input.focus,
          input.earlierId,
          input.laterId,
        ),
      );
    }
    if (path === "settings") {
      const rules = ruleSchema.parse(body);
      await put("settings", u, rules);
      return reply(rules);
    }
    if (path === "portfolio") {
      const { symbols } = z
        .object({ symbols: z.array(z.string().min(1).max(24)).max(25) })
        .parse(body);
      return reply(await service.setPortfolio(u, symbols));
    }
    if (path === "read") {
      const { id, read } = z
        .object({ id: z.string().min(1).max(120), read: z.boolean() })
        .parse(body);
      await service.markRead(u, id, read);
      return reply({ saved: true });
    }
    if (path === "filing") {
      const { id } = z.object({ id: z.string().min(1).max(120) }).parse(body);
      return reply(await service.indexFiling(u, id), 202);
    }
    if (path === "refresh")
      return reply(await service.newJob("refresh", u), 202);
    if (path === "research") {
      const { symbol } = z
        .object({ symbol: z.string().min(1).max(24) })
        .parse(body);
      return reply(await service.newJob("research", u, symbol), 202);
    }
    if (path.startsWith("jobs/") && path.endsWith("/step"))
      return reply(await service.stepJob(path.split("/")[1], u));
    return reply({ error: "Not found" }, 404);
  } catch (e: unknown) {
    return json(
      { error: e instanceof Error ? e.message : "Request failed" },
      400,
    );
  }
}
