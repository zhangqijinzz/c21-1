import { UNASSIGNED_STAGE_NAME } from "../../shared/domain/stages";
import type {
  LatencyProject,
  RequestNode,
  ScenarioSnapshot,
  SimulationResult,
  StageDefinition,
} from "../../shared/domain/types";

export interface StageDelta {
  stageId: string | null;
  name: string;
  baselineMs: number | null;
  comparisonMs: number | null;
}

export interface ScenarioComparison {
  deltaMs: number;
  changes: string[];
  stageDeltas: StageDelta[];
  outcome: "faster" | "slower" | "equal";
}

function stageNameOf(
  stages: StageDefinition[],
  stageId: string | undefined,
): string {
  if (!stageId) return UNASSIGNED_STAGE_NAME;
  return (
    stages.find((stage) => stage.id === stageId)?.name ?? UNASSIGNED_STAGE_NAME
  );
}

function describeNodeChanges(
  before: RequestNode,
  after: RequestNode,
  baselineStages: StageDefinition[],
  comparisonStages: StageDefinition[],
): string[] {
  const changes: string[] = [];
  if (before.durationMs !== after.durationMs)
    changes.push(
      `${before.name} · 耗时 ${before.durationMs} → ${after.durationMs} ms`,
    );
  if (before.jitterMs !== after.jitterMs)
    changes.push(
      `${before.name} · 波动 ±${before.jitterMs} → ±${after.jitterMs} ms`,
    );
  if (before.timeoutMs !== after.timeoutMs)
    changes.push(
      `${before.name} · 超时 ${before.timeoutMs} → ${after.timeoutMs} ms`,
    );
  if (before.retryCount !== after.retryCount)
    changes.push(
      `${before.name} · 重试 ${before.retryCount} → ${after.retryCount} 次`,
    );
  if (before.failureRate !== after.failureRate)
    changes.push(
      `${before.name} · 失败率 ${before.failureRate} → ${after.failureRate}%`,
    );
  if (before.fallbackNodeId !== after.fallbackNodeId)
    changes.push(`${before.name} · 降级目标已调整`);
  if (before.dependencyIds.join("|") !== after.dependencyIds.join("|"))
    changes.push(`${before.name} · 前置依赖已调整`);
  if ((before.stageId ?? null) !== (after.stageId ?? null))
    changes.push(
      `${before.name} · 分段 ${stageNameOf(baselineStages, before.stageId)} → ${stageNameOf(comparisonStages, after.stageId)}`,
    );
  return changes;
}

function describeStageChanges(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
): string[] {
  const changes: string[] = [];
  for (const stage of baseline.stages) {
    const next = comparison.stages.find((item) => item.id === stage.id);
    if (!next) changes.push(`分段「${stage.name}」· 已移除`);
    else if (next.name !== stage.name)
      changes.push(`分段「${stage.name}」→「${next.name}」`);
  }
  for (const stage of comparison.stages) {
    if (!baseline.stages.some((item) => item.id === stage.id))
      changes.push(`分段「${stage.name}」· 新增分段`);
  }
  const baselineOrder = baseline.stages.map((stage) => stage.id);
  const comparisonOrder = comparison.stages.map((stage) => stage.id);
  if (
    baselineOrder.length === comparisonOrder.length &&
    baselineOrder.every((id) => comparisonOrder.includes(id)) &&
    baselineOrder.join("|") !== comparisonOrder.join("|")
  )
    changes.push("分段顺序已调整");
  return changes;
}

function compareStageCompletions(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
): StageDelta[] {
  const baselineMap = new Map(
    baseline.stageCompletions.map((item) => [item.stageId, item]),
  );
  const comparisonMap = new Map(
    comparison.stageCompletions.map((item) => [item.stageId, item]),
  );
  const keys: (string | null)[] = [];
  for (const item of [
    ...comparison.stageCompletions,
    ...baseline.stageCompletions,
  ]) {
    if (!keys.includes(item.stageId)) keys.push(item.stageId);
  }
  return keys.map((key) => {
    const before = baselineMap.get(key);
    const after = comparisonMap.get(key);
    return {
      stageId: key,
      name: after?.name ?? before?.name ?? UNASSIGNED_STAGE_NAME,
      baselineMs: before?.completionMs ?? null,
      comparisonMs: after?.completionMs ?? null,
    };
  });
}

export function compareScenarios(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
): ScenarioComparison {
  const baselineNodes = new Map(baseline.nodes.map((node) => [node.id, node]));
  const comparisonNodes = new Map(
    comparison.nodes.map((node) => [node.id, node]),
  );
  const changes = [
    ...describeStageChanges(baseline, comparison),
    ...baseline.nodes.flatMap((node) => {
      const next = comparisonNodes.get(node.id);
      return next
        ? describeNodeChanges(node, next, baseline.stages, comparison.stages)
        : [`${node.name} · 已从对照方案移除`];
    }),
    ...comparison.nodes
      .filter((node) => !baselineNodes.has(node.id))
      .map((node) => `${node.name} · 新增请求节点`),
  ];
  if (baseline.concurrencyLimit !== comparison.concurrencyLimit)
    changes.unshift(
      `并发上限 · ${baseline.concurrencyLimit ?? "不限"} → ${comparison.concurrencyLimit ?? "不限"}`,
    );
  return {
    deltaMs: comparison.completionMs - baseline.completionMs,
    changes,
    stageDeltas: compareStageCompletions(baseline, comparison),
    outcome:
      comparison.completionMs < baseline.completionMs
        ? "faster"
        : comparison.completionMs > baseline.completionMs
          ? "slower"
          : "equal",
  };
}

export function saveScenario(
  project: LatencyProject,
  result: SimulationResult,
  name: string,
): LatencyProject {
  if (
    result.warnings.some(
      (warning) => warning.includes("检测到循环") || warning.includes("不能"),
    )
  )
    return project;
  const snapshot: ScenarioSnapshot = {
    id: crypto.randomUUID(),
    name: name.trim() || `方案 ${project.scenarios.length + 1}`,
    createdAt: Date.now(),
    concurrencyLimit: project.concurrencyLimit,
    nodes: structuredClone(project.nodes),
    stages: structuredClone(project.stages),
    stageCompletions: result.stages.map((report) => ({
      stageId: report.stageId,
      name: report.name,
      completionMs: report.completionMs,
    })),
    completionMs: result.completionMs,
    criticalPath: [...result.criticalPath],
  };
  return {
    ...project,
    scenarios: [snapshot, ...project.scenarios],
    updatedAt: Date.now(),
  };
}

export function removeScenario(
  project: LatencyProject,
  scenarioId: string,
): LatencyProject {
  return {
    ...project,
    scenarios: project.scenarios.filter(
      (scenario) => scenario.id !== scenarioId,
    ),
    updatedAt: Date.now(),
  };
}

export function restoreScenario(
  project: LatencyProject,
  scenarioId: string,
): LatencyProject {
  const snapshot = project.scenarios.find(
    (scenario) => scenario.id === scenarioId,
  );
  if (!snapshot) return project;
  return {
    ...project,
    nodes: structuredClone(snapshot.nodes),
    stages: structuredClone(snapshot.stages),
    concurrencyLimit: snapshot.concurrencyLimit,
    updatedAt: Date.now(),
  };
}
