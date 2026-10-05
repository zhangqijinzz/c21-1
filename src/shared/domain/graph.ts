import type {
  ChainSegment,
  LatencyProject,
  RequestNode,
  ValidationResult,
} from "./types";
import { UNASSIGNED_SEGMENT_NAME } from "./types";

export interface GraphAnalysis {
  order: string[];
  cycle: string[];
  validation: ValidationResult;
  /** 违反“分段顺序必须与依赖方向一致”的节点对，segmentA 在 segmentB 之前但存在 B → A 的依赖。 */
  segmentConflicts: SegmentConflict[];
}

export interface SegmentConflict {
  fromNodeId: string;
  fromSegmentId: string;
  toNodeId: string;
  toSegmentId: string;
}

/** 分段顺序与依赖方向矛盾属于硬错误，会阻止推演。 */
export function findSegmentConflicts(
  project: LatencyProject,
): SegmentConflict[] {
  const orderIndex = new Map(
    project.segments.map((segment, index) => [segment.id, index]),
  );
  const segmentOf = (node?: RequestNode): string | undefined =>
    node?.segmentId && orderIndex.has(node.segmentId)
      ? node.segmentId
      : undefined;
  const conflicts: SegmentConflict[] = [];
  const seen = new Set<string>();
  for (const node of project.nodes) {
    const nodeSegment = segmentOf(node);
    if (!nodeSegment) continue;
    for (const dependencyId of node.dependencyIds) {
      const dependency = project.nodes.find((item) => item.id === dependencyId);
      const dependencySegment = segmentOf(dependency);
      if (!dependencySegment || dependencySegment === nodeSegment) continue;
      // node 依赖 dependency：合理方向是 dependency 所在分段在前。
      if (
        (orderIndex.get(nodeSegment) ?? 0) <
        (orderIndex.get(dependencySegment) ?? 0)
      ) {
        const key = `${node.id}>${dependencyId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          fromNodeId: node.id,
          fromSegmentId: nodeSegment,
          toNodeId: dependencyId,
          toSegmentId: dependencySegment,
        });
      }
    }
  }
  return conflicts;
}

export function getSegments(project: LatencyProject): ChainSegment[] {
  return project.segments ?? [];
}

export function getNodeSegment(
  project: LatencyProject,
  node: RequestNode,
): ChainSegment | undefined {
  if (!node.segmentId) return undefined;
  return project.segments.find((segment) => segment.id === node.segmentId);
}

export function analyzeGraph(project: LatencyProject): GraphAnalysis {
  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const incoming = new Map(project.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(
    project.nodes.map((node) => [node.id, [] as string[]]),
  );
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const node of project.nodes) {
    if (!node.name.trim()) errors.push(`${node.id}: 节点名称不能为空`);
    if (node.durationMs < 0 || !Number.isFinite(node.durationMs))
      errors.push(`${node.name}: 耗时必须大于等于 0`);
    if (node.jitterMs < 0 || !Number.isFinite(node.jitterMs))
      errors.push(`${node.name}: 波动范围必须大于等于 0`);
    if (node.timeoutMs < 0 || !Number.isFinite(node.timeoutMs))
      errors.push(`${node.name}: 超时必须大于等于 0`);
    if (
      !Number.isInteger(node.retryCount) ||
      node.retryCount < 0 ||
      node.retryCount > 8
    )
      errors.push(`${node.name}: 重试次数需在 0–8 次`);
    if (node.failureRate < 0 || node.failureRate > 100)
      errors.push(`${node.name}: 失败概率需在 0–100%`);
    if (node.retryCount > 3)
      warnings.push(`${node.name}: 重试次数较高，可能放大尾延迟`);
    for (const dependencyId of node.dependencyIds) {
      if (!nodeIds.has(dependencyId)) {
        errors.push(`${node.name}: 前置节点不存在`);
        continue;
      }
      if (dependencyId === node.id) {
        errors.push(`${node.name}: 不能依赖自身`);
        continue;
      }
      incoming.set(node.id, (incoming.get(node.id) ?? 0) + 1);
      outgoing.get(dependencyId)?.push(node.id);
    }
    if (node.fallbackNodeId) {
      if (!nodeIds.has(node.fallbackNodeId))
        errors.push(`${node.name}: 降级目标不存在`);
      if (node.fallbackNodeId === node.id)
        errors.push(`${node.name}: 降级目标不能是自身`);
    }
  }

  const segmentConflicts = findSegmentConflicts(project);
  const segmentName = (id: string): string =>
    project.segments.find((segment) => segment.id === id)?.name ?? id;
  const nodeName = (id: string): string =>
    project.nodes.find((node) => node.id === id)?.name ?? id;

  for (const segment of project.segments) {
    if (!segment.name.trim())
      errors.push(`分段 ${segment.id}: 分段名称不能为空`);
  }
  const seenNames = new Map<string, number>();
  for (const segment of project.segments) {
    const key = segment.name.trim();
    if (!key) continue;
    seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
  }
  for (const [name, count] of seenNames) {
    if (count > 1)
      errors.push(`分段重名：“${name}” 被使用了 ${count} 次，分段名称需唯一`);
  }
  const danglingNodes = project.nodes.filter(
    (node) =>
      node.segmentId !== undefined &&
      !project.segments.some((segment) => segment.id === node.segmentId),
  );
  for (const node of danglingNodes)
    errors.push(`${node.name}: 所属分段不存在，请重新选择分段`);

  const unassignedNodes = project.nodes.filter(
    (node) => node.segmentId === undefined,
  );
  if (project.segments.length > 0) {
    if (unassignedNodes.length > 0)
      warnings.push(
        `${unassignedNodes.length} 个节点尚未归属分段（${unassignedNodes
          .map((node) => node.name)
          .join("、")}），已归入“${UNASSIGNED_SEGMENT_NAME}”`,
      );
    const unused = project.segments.filter(
      (segment) => !project.nodes.some((node) => node.segmentId === segment.id),
    );
    for (const segment of unused)
      warnings.push(`分段“${segment.name}”还没有节点`);
  }
  for (const conflict of segmentConflicts) {
    errors.push(
      `分段顺序与依赖方向矛盾：“${nodeName(conflict.toNodeId)}”（${segmentName(
        conflict.toSegmentId,
      )}）被“${nodeName(conflict.fromNodeId)}”（${segmentName(
        conflict.fromSegmentId,
      )}）依赖，但前者在链路分段中排在后面`,
    );
  }

  const ready = project.nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const degree = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, degree);
      if (degree === 0) ready.push(next);
    }
  }

  const cycle: string[] = [];
  if (order.length !== project.nodes.length) {
    const color = new Map(project.nodes.map((node) => [node.id, 0]));
    const stack: string[] = [];
    const visit = (id: string): boolean => {
      color.set(id, 1);
      stack.push(id);
      const node = project.nodes.find((item) => item.id === id);
      for (const dependencyId of node?.dependencyIds ?? []) {
        if (!nodeIds.has(dependencyId)) continue;
        const dependencyColor = color.get(dependencyId) ?? 0;
        if (dependencyColor === 1) {
          const start = stack.indexOf(dependencyId);
          cycle.push(...stack.slice(start), dependencyId);
          return true;
        }
        if (dependencyColor === 0 && visit(dependencyId)) return true;
      }
      stack.pop();
      color.set(id, 2);
      return false;
    };
    for (const node of project.nodes) {
      if ((color.get(node.id) ?? 0) === 0 && visit(node.id)) break;
    }
  }
  if (cycle.length)
    errors.push(
      `检测到循环依赖：${cycle.map((id) => project.nodes.find((node) => node.id === id)?.name ?? id).join(" → ")}`,
    );
  if (
    project.nodes.some((node) => node.dependencyIds.length === 0) &&
    project.nodes.length > 1
  ) {
    warnings.push("多个入口节点会同时开始；并发上限可能让部分入口排队");
  }
  return { order, cycle, validation: { errors, warnings }, segmentConflicts };
}

export function updateNode(
  nodes: RequestNode[],
  id: string,
  patch: Partial<RequestNode>,
): RequestNode[] {
  return nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
}
