import type {
  LatencyProject,
  StageDefinition,
} from "../../shared/domain/types";

export function addStage(project: LatencyProject): LatencyProject {
  const stage: StageDefinition = {
    id: `stage-${crypto.randomUUID()}`,
    name: `分段 ${project.stages.length + 1}`,
  };
  return {
    ...project,
    stages: [...project.stages, stage],
    updatedAt: Date.now(),
  };
}

export function renameStage(
  project: LatencyProject,
  id: string,
  name: string,
): LatencyProject {
  return {
    ...project,
    stages: project.stages.map((stage) =>
      stage.id === id ? { ...stage, name } : stage,
    ),
    updatedAt: Date.now(),
  };
}

export function moveStage(
  project: LatencyProject,
  id: string,
  offset: -1 | 1,
): LatencyProject {
  const index = project.stages.findIndex((stage) => stage.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= project.stages.length)
    return project;
  const stages = [...project.stages];
  const [stage] = stages.splice(index, 1);
  if (!stage) return project;
  stages.splice(target, 0, stage);
  return { ...project, stages, updatedAt: Date.now() };
}

export function removeStage(
  project: LatencyProject,
  id: string,
): LatencyProject {
  return {
    ...project,
    stages: project.stages.filter((stage) => stage.id !== id),
    nodes: project.nodes.map((node) =>
      node.stageId === id ? { ...node, stageId: undefined } : node,
    ),
    updatedAt: Date.now(),
  };
}
