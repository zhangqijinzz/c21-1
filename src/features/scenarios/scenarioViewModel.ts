import { simulateProject } from "../../shared/domain/simulation";
import type {
  LatencyProject,
  RequestNode,
  ScenarioSnapshot,
  SegmentStat,
  SimulationResult,
} from "../../shared/domain/types";

export interface SegmentComparison {
  segmentId: string;
  name: string;
  baselineMs: number;
  comparisonMs: number;
  deltaMs: number;
  /** 该分段在哪个方案里拖了关键链路的后腿。 */
  bottleneckIn: "baseline" | "comparison" | "both" | "none";
  unassigned: boolean;
}

export interface ScenarioComparison {
  deltaMs: number;
  changes: string[];
  outcome: "faster" | "slower" | "equal";
  segmentComparisons: SegmentComparison[];
}

/** 老快照没有分段统计时，用保存的图重新推演补齐，保证老方案也能参与分段对比。 */
function effectiveStats(snapshot: ScenarioSnapshot): SegmentStat[] {
  if (snapshot.segmentStats.length) return snapshot.segmentStats;
  const project: LatencyProject = {
    id: "snapshot-projection",
    title: snapshot.name,
    nodes: snapshot.nodes,
    segments: snapshot.segments,
    concurrencyLimit: snapshot.concurrencyLimit,
    scenarios: [],
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
  };
  return simulateProject(project, "expected").segments;
}

function describeNodeChanges(
  before: RequestNode,
  after: RequestNode,
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
  return changes;
}

function compareSegments(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
): SegmentComparison[] {
  const baselineStats = effectiveStats(baseline);
  const comparisonStats = effectiveStats(comparison);
  const baselineMap = new Map(
    baselineStats.map((stat) => [stat.segmentId, stat]),
  );
  const comparisonMap = new Map(
    comparisonStats.map((stat) => [stat.segmentId, stat]),
  );
  const ids: string[] = [];
  for (const stat of baselineStats) ids.push(stat.segmentId);
  for (const stat of comparisonStats)
    if (!baselineMap.has(stat.segmentId)) ids.push(stat.segmentId);
  const orderOf = (id: string): number =>
    baselineMap.get(id)?.order ??
    comparisonMap.get(id)?.order ??
    Number.MAX_SAFE_INTEGER;
  return ids
    .map((id) => {
      const base = baselineMap.get(id);
      const other = comparisonMap.get(id);
      const name = other?.name ?? base?.name ?? id;
      const baselineMs = base?.completionMs ?? 0;
      const comparisonMs = other?.completionMs ?? 0;
      const bottleneckIn: SegmentComparison["bottleneckIn"] =
        base?.isBottleneck && other?.isBottleneck
          ? "both"
          : base?.isBottleneck
            ? "baseline"
            : other?.isBottleneck
              ? "comparison"
              : "none";
      return {
        segmentId: id,
        name,
        baselineMs,
        comparisonMs,
        deltaMs: comparisonMs - baselineMs,
        bottleneckIn,
        unassigned: Boolean(base?.unassigned || other?.unassigned),
      };
    })
    .sort((a, b) => orderOf(a.segmentId) - orderOf(b.segmentId));
}

export function compareScenarios(
  baseline: ScenarioSnapshot,
  comparison: ScenarioSnapshot,
): ScenarioComparison {
  const baselineNodes = new Map(baseline.nodes.map((node) => [node.id, node]));
  const comparisonNodes = new Map(
    comparison.nodes.map((node) => [node.id, node]),
  );
  const segmentNameById = new Map(
    [...baseline.segments, ...comparison.segments].map((segment) => [
      segment.id,
      segment.name,
    ]),
  );
  const changes = [
    ...baseline.nodes.flatMap((node) => {
      const next = comparisonNodes.get(node.id);
      if (!next) return [`${node.name} · 已从对照方案移除`];
      const nodeChanges = describeNodeChanges(node, next);
      if (node.segmentId !== next.segmentId) {
        const from = node.segmentId
          ? (segmentNameById.get(node.segmentId) ?? "未分段")
          : "未分段";
        const to = next.segmentId
          ? (segmentNameById.get(next.segmentId) ?? "未分段")
          : "未分段";
        nodeChanges.push(`${node.name} · 分段 ${from} → ${to}`);
      }
      return nodeChanges;
    }),
    ...comparison.nodes
      .filter((node) => !baselineNodes.has(node.id))
      .map((node) => `${node.name} · 新增请求节点`),
  ];
  if (baseline.concurrencyLimit !== comparison.concurrencyLimit)
    changes.unshift(
      `并发上限 · ${baseline.concurrencyLimit ?? "不限"} → ${comparison.concurrencyLimit ?? "不限"}`,
    );
  const baselineNames = baseline.segments
    .map((segment) => segment.name)
    .join("|");
  const comparisonNames = comparison.segments
    .map((segment) => segment.name)
    .join("|");
  if (baselineNames !== comparisonNames)
    changes.unshift(
      `链路分段 · ${baseline.segments.map((segment) => segment.name).join(" → ") || "未分段"} → ${comparison.segments.map((segment) => segment.name).join(" → ") || "未分段"}`,
    );
  return {
    deltaMs: comparison.completionMs - baseline.completionMs,
    changes,
    outcome:
      comparison.completionMs < baseline.completionMs
        ? "faster"
        : comparison.completionMs > baseline.completionMs
          ? "slower"
          : "equal",
    segmentComparisons: compareSegments(baseline, comparison),
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
    segments: structuredClone(project.segments),
    segmentStats: structuredClone(result.segments),
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
    // 快照保存时的分段定义一并恢复，节点归属与分段保持一致。
    segments: structuredClone(snapshot.segments),
    concurrencyLimit: snapshot.concurrencyLimit,
    updatedAt: Date.now(),
  };
}
