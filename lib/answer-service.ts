import { env } from "cloudflare:workers";
import { db, get, insertOnce, put, remove } from "./store";
import { research, financialContext, resolveCompany } from "./services";
import {
  planQuestion,
  numericalAnswer,
  guidanceAnswer,
  quarterKey,
} from "./question-plan";
import {
  generateAnswer,
  MODEL,
  ModelError,
  PROMPT_VERSION,
  type Synthesis,
} from "./model";
import { reviewSupport } from "./support-review";
import { sha256 } from "./collectors";

export function modelStatus() {
  return {
    configured: !!env.HYDE_API_KEY?.trim(),
    provider: "Hyde",
    model: env.HYDE_MODEL || MODEL,
  };
}

async function reserveQuota(id: string, limit: number) {
  await insertOnce("model_budget", id, { count: 0 });
  const result = await db()
    .prepare(
      "UPDATE records SET payload=json_set(payload,'$.count',json_extract(payload,'$.count')+1),updated_at=? WHERE kind='model_budget' AND id=? AND json_extract(payload,'$.count') < ?",
    )
    .bind(new Date().toISOString(), id, limit)
    .run();
  return result.meta.changes > 0;
}

export async function answerQuestion(
  user: string,
  symbol: string,
  question: string,
  asOf?: string,
) {
  const plan = planQuestion(
    resolveCompany(symbol).symbol,
    question,
    asOf ?? new Date().toISOString(),
  );
  let base = await research(
    symbol,
    question,
    plan.asOf,
    plan.intent === "numerical" || plan.intent === "guidance",
  );
  const facts = await financialContext(base.company.symbol, base.documents);
  if (plan.intent === "numerical" || plan.intent === "guidance") {
    const structured =
      plan.intent === "numerical"
        ? numericalAnswer(plan, facts.tables)
        : guidanceAnswer(plan, facts.guidance);
    return {
      ...base,
      plan,
      structured,
      evidence: structured.evidence,
      model: modelStatus(),
      synthesis: null,
      modelError: null,
    };
  }
  const structured =
    plan.intent === "explanation" &&
    (plan.metric || plan.operation === "margin" || plan.expectsDecline)
      ? numericalAnswer(plan, facts.tables)
      : undefined;
  if (
    structured &&
    (structured.status === "insufficient_evidence" ||
      (plan.expectsDecline && structured.premise !== "confirmed"))
  )
    return {
      ...base,
      plan,
      structured,
      model: modelStatus(),
      synthesis: null,
      modelError: null,
    };
  if (structured?.calculations.length) {
    const period = quarterKey(structured.calculations[0].period);
    if (period)
      base = {
        ...(await research(symbol, `${question} ${period}`, base.asOf)),
        question,
      };
  }
  const instructions = structured
    ? `Verified calculation context: ${JSON.stringify(structured)}. Explain only management-attributed drivers for these exact periods and metric. Do not infer proven causation, introduce other figures, or repeat a premise contradicted by the calculation. If period-specific management evidence is absent, abstain.`
    : undefined;
  const result = await synthesizeEvidence(
    user,
    base,
    question,
    plan.version + ":" + plan.intent,
    undefined,
    instructions,
  );
  return { ...result, plan, structured };
}

export async function synthesizeEvidence(
  user: string,
  base: Awaited<ReturnType<typeof research>>,
  question: string,
  task = "answer",
  validate: (answer: Synthesis) => Synthesis = (answer) => answer,
  taskInstructions?: string,
  comparisonContract = false,
) {
  const config = modelStatus();
  const configuredLimit = Number(env.FINN_DAILY_MODEL_REQUESTS ?? 100);
  const globalLimit =
    Number.isInteger(configuredLimit) &&
    configuredLimit >= 1 &&
    configuredLimit <= 200
      ? configuredLimit
      : 100;
  const fallback = (code: string, message: string) => ({
    ...base,
    model: config,
    synthesis: null,
    modelError: { code, message },
  });
  if (!config.configured)
    return fallback(
      "not_configured",
      "Evidence search is available. Model synthesis needs a server-side Hyde key.",
    );
  if (!base.evidence.length)
    return fallback(
      "no_evidence",
      "No matching, date-eligible evidence was found. The model was not called.",
    );
  const key = await sha256(
    JSON.stringify({
      user,
      model: config.model,
      prompt: PROMPT_VERSION,
      task,
      symbol: base.company.symbol,
      question: question.trim(),
      asOf: base.asOf.slice(0, 10),
      evidence: base.evidence,
      taskInstructions,
      comparisonContract,
    }),
  );
  const cached = await get<Synthesis>("answer", key);
  if (cached && Date.now() - Date.parse(cached.generatedAt) < 86400000)
    return {
      ...base,
      model: config,
      synthesis: { ...cached, cached: true },
      modelError: null,
    };
  const lockId = `model:${user}`;
  await db()
    .prepare(
      "DELETE FROM records WHERE kind='lock' AND id=? AND json_extract(payload,'$.until') < ?",
    )
    .bind(lockId, Date.now())
    .run();
  if (!(await insertOnce("lock", lockId, { until: Date.now() + 150000 })))
    return fallback(
      "busy",
      "An answer is already being prepared. Please wait for it to finish.",
    );
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (
      !(await reserveQuota(`${user}:${day}`, 30)) ||
      !(await reserveQuota(`all:${day}`, globalLimit))
    )
      return fallback(
        "daily_limit",
        "The prototype’s daily model request limit has been reached. Evidence search remains available.",
      );
    let synthesis = await generateAnswer({
      apiKey: env.HYDE_API_KEY!,
      model: config.model,
      company: base.company,
      question,
      asOf: base.asOf,
      evidence: base.evidence,
      taskInstructions,
      comparisonContract,
      validateDraft: validate,
      reserveRepair: async () =>
        (await reserveQuota(`${user}:${day}`, 30)) &&
        (await reserveQuota(`all:${day}`, globalLimit)),
    });
    if (synthesis.claims.length) {
      if (
        !(await reserveQuota(`${user}:${day}`, 30)) ||
        !(await reserveQuota(`all:${day}`, globalLimit))
      )
        return fallback(
          "daily_limit",
          "The support-review budget is exhausted. No unreviewed answer is shown.",
        );
      try {
        synthesis = await reviewSupport(
          synthesis,
          env.HYDE_API_KEY!,
          fetch,
          question,
        );
      } catch {
        return fallback(
          "support_review_failed",
          "Claim support could not be checked. Please retry; the source excerpts are available below.",
        );
      }
    }
    synthesis = validate(synthesis);
    await put("answer", key, synthesis, base.company.symbol);
    await put(
      "model_run",
      crypto.randomUUID(),
      {
        user,
        symbol: base.company.symbol,
        status: synthesis.status,
        model: config.model,
        prompt: PROMPT_VERSION,
        usage: synthesis.usage,
        validation: synthesis.validation,
        finishedAt: synthesis.generatedAt,
      },
      base.company.symbol,
      synthesis.generatedAt,
    );
    return { ...base, model: config, synthesis, modelError: null };
  } catch (error) {
    const code = error instanceof ModelError ? error.code : "internal";
    const message =
      error instanceof ModelError
        ? error.message
        : "The answer could not be prepared. The source evidence is still available.";
    await put(
      "model_run",
      crypto.randomUUID(),
      {
        user,
        symbol: base.company.symbol,
        status: "failed",
        code,
        finishedAt: new Date().toISOString(),
      },
      base.company.symbol,
    );
    return fallback(code, message);
  } finally {
    await remove("lock", lockId);
  }
}
