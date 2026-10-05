import { findSegmentConflicts } from "../../shared/domain/graph";
import type { ChainSegment, LatencyProject } from "../../shared/domain/types";

export interface SegmentEditResult {
  project: LatencyProject;
  error?: string;
}

function touch(project: LatencyProject): LatencyProject {
  return { ...project, updatedAt: Date.now() };
}

/** 新建分段；重名或空名直接拒绝并给出原因。 */
export function addSegment(
  project: LatencyProject,
  rawName: string,
): SegmentEditResult {
  const name = rawName.trim();
  if (!name) return { project, error: "分段名称不能为空" };
  if (project.segments.some((segment) => segment.name === name))
    return { project, error: `分段重名：已存在名为“${name}”的分段` };
  const segment: ChainSegment = { id: crypto.randomUUID(), name };
  return {
    project: touch({ ...project, segments: [...project.segments, segment] }),
  };
}

/** 重命名分段；重名时保持原状并返回错误。 */
export function renameSegment(
  project: LatencyProject,
  segmentId: string,
  rawName: string,
): SegmentEditResult {
  const name = rawName.trim();
  if (!name) return { project, error: "分段名称不能为空" };
  const current = project.segments.find((segment) => segment.id === segmentId);
  if (!current) return { project, error: "没有找到该分段" };
  if (current.name === name) return { project };
  if (project.segments.some((segment) => segment.name === name))
    return {
      project,
      error: `已存在名为“${name}”的分段，分段名称需唯一`,
    };
  return {
    project: touch({
      ...project,
      segments: project.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, name } : segment,
      ),
    }),
  };
}

/** 删除分段；段内节点退回“未归属”，不会被一起删除。 */
export function removeSegment(
  project: LatencyProject,
  segmentId: string,
): LatencyProject {
  return touch({
    ...project,
    segments: project.segments.filter((segment) => segment.id !== segmentId),
    nodes: project.nodes.map((node) =>
      node.segmentId === segmentId ? { ...node, segmentId: undefined } : node,
    ),
  });
}

/**
 * 调整分段先后顺序。若新顺序与依赖方向矛盾（靠前的分段反而依赖靠后的分段），
 * 拒绝本次调整并说明是哪两个分段、哪条依赖冲突。
 */
export function moveSegment(
  project: LatencyProject,
  segmentId: string,
  direction: -1 | 1,
): SegmentEditResult {
  const index = project.segments.findIndex(
    (segment) => segment.id === segmentId,
  );
  const target = index + direction;
  if (index < 0 || target < 0 || target >= project.segments.length)
    return { project };
  const segments = [...project.segments];
  [segments[index], segments[target]] = [segments[target]!, segments[index]!];
  const candidate = touch({ ...project, segments });
  const conflicts = findSegmentConflicts(candidate);
  if (conflicts.length) {
    const nameOf = (id: string) =>
      project.segments.find((segment) => segment.id === id)?.name ?? id;
    const nodeName = (id: string) =>
      project.nodes.find((node) => node.id === id)?.name ?? id;
    const conflict = conflicts[0]!;
    return {
      project,
      error: `顺序调整被拒绝：“${nodeName(conflict.fromNodeId)}”（${nameOf(
        conflict.fromSegmentId,
      )}）依赖“${nodeName(conflict.toNodeId)}”（${nameOf(
        conflict.toSegmentId,
      )}），${nameOf(conflict.toSegmentId)}必须排在前面`,
    };
  }
  return { project: candidate };
}

/** 把节点归属到某分段；传 undefined 表示移出分段（未归属）。 */
export function assignNodeSegment(
  project: LatencyProject,
  nodeId: string,
  segmentId: string | undefined,
): LatencyProject {
  return touch({
    ...project,
    nodes: project.nodes.map((node) =>
      node.id === nodeId ? { ...node, segmentId } : node,
    ),
  });
}

export function nodeCountBySegment(
  project: LatencyProject,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of project.nodes) {
    if (node.segmentId === undefined) continue;
    counts.set(node.segmentId, (counts.get(node.segmentId) ?? 0) + 1);
  }
  return counts;
}
