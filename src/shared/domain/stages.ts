import type {
  LatencyProject,
  RequestNode,
  StageReport,
  TimelineEntry,
  ValidationResult,
} from "./types";

export const UNASSIGNED_STAGE_NAME = "未分段";

export function resolveNodeStageId(
  project: LatencyProject,
  node: RequestNode,
): string | null {
  if (!node.stageId) return null;
  return project.stages.some((stage) => stage.id === node.stageId)
    ? node.stageId
    : null;
}

export function validateStages(project: LatencyProject): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenNames = new Map<string, number>();
  for (const stage of project.stages) {
    const name = stage.name.trim();
    if (!name) {
      errors.push("分段名称不能为空");
      continue;
    }
    seenNames.set(name, (seenNames.get(name) ?? 0) + 1);
  }
  for (const [name, count] of seenNames) {
    if (count > 1)
      errors.push(`分段「${name}」名称重复，分组结果会产生歧义，请改名`);
  }

  const stageOrder = new Map(
    project.stages.map((stage, index) => [stage.id, index]),
  );
  const stageName = (id: string) =>
    project.stages.find((stage) => stage.id === id)?.name ?? id;
  const byId = new Map(project.nodes.map((node) => [node.id, node]));
  let unassigned = 0;
  for (const node of project.nodes) {
    if (node.stageId && !stageOrder.has(node.stageId))
      warnings.push(`${node.name}: 指向的分段不存在，已按未分段处理`);
    const nodeStage = resolveNodeStageId(project, node);
    if (nodeStage === null) {
      unassigned += 1;
      continue;
    }
    for (const dependencyId of node.dependencyIds) {
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      const dependencyStage = resolveNodeStageId(project, dependency);
      if (dependencyStage === null || dependencyStage === nodeStage) continue;
      if (
        (stageOrder.get(nodeStage) ?? 0) <
        (stageOrder.get(dependencyStage) ?? 0)
      )
        warnings.push(
          `分段顺序与依赖方向矛盾：「${stageName(nodeStage)}」的 ${node.name} 依赖了靠后分段「${stageName(dependencyStage)}」的 ${dependency.name}，分段完成时间会交错`,
        );
    }
  }
  if (project.stages.length > 0 && unassigned > 0)
    warnings.push(
      `${unassigned} 个请求未归属分段，推演时归入「${UNASSIGNED_STAGE_NAME}」组`,
    );
  return { errors, warnings };
}

export function buildStageReports(
  project: LatencyProject,
  entries: TimelineEntry[],
  criticalPath: string[],
): StageReport[] {
  if (!project.stages.length || !entries.length) return [];
  const critical = new Set(criticalPath);
  const groups = new Map<string | null, TimelineEntry[]>();
  for (const entry of entries) {
    const key = entry.stageId;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const toReport = (
    stageId: string | null,
    name: string,
    group: TimelineEntry[],
  ): StageReport => ({
    stageId,
    name,
    nodeIds: group.map((entry) => entry.nodeId),
    startMs: group.reduce(
      (start, entry) => Math.min(start, entry.startMs),
      Number.POSITIVE_INFINITY,
    ),
    completionMs: group.reduce((end, entry) => Math.max(end, entry.endMs), 0),
    waitMs: group.reduce((wait, entry) => wait + entry.waitMs, 0),
    criticalNodeIds: group
      .filter((entry) => critical.has(entry.nodeId))
      .map((entry) => entry.nodeId),
    bottleneck: false,
  });
  const reports: StageReport[] = [];
  for (const stage of project.stages) {
    const group = groups.get(stage.id);
    if (group?.length) reports.push(toReport(stage.id, stage.name, group));
  }
  const unassigned = groups.get(null);
  if (unassigned?.length)
    reports.push(toReport(null, UNASSIGNED_STAGE_NAME, unassigned));
  if (reports.length > 1) {
    const slowest = reports.reduce((top, report) =>
      report.completionMs > top.completionMs ? report : top,
    );
    slowest.bottleneck = true;
  }
  return reports;
}
