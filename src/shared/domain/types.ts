export interface RequestNode {
  id: string;
  name: string;
  durationMs: number;
  jitterMs: number;
  dependencyIds: string[];
  timeoutMs: number;
  retryCount: number;
  failureRate: number;
  fallbackNodeId?: string;
  stageId?: string;
}

export interface StageDefinition {
  id: string;
  name: string;
}

export interface StageCompletion {
  stageId: string | null;
  name: string;
  completionMs: number;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: number;
  concurrencyLimit: number | null;
  nodes: RequestNode[];
  stages: StageDefinition[];
  stageCompletions: StageCompletion[];
  completionMs: number;
  criticalPath: string[];
}

export interface LatencyProject {
  id: string;
  title: string;
  nodes: RequestNode[];
  stages: StageDefinition[];
  concurrencyLimit: number | null;
  scenarios: ScenarioSnapshot[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceDocument {
  version: 1;
  activeProjectId: string;
  projects: LatencyProject[];
}

export type SimulationMode = "low" | "expected" | "high";

export interface TimelineEntry {
  nodeId: string;
  stageId: string | null;
  startMs: number;
  endMs: number;
  modeledDurationMs: number;
  waitMs: number;
  criticalPredecessorId?: string;
}

export interface StageReport {
  stageId: string | null;
  name: string;
  nodeIds: string[];
  startMs: number;
  completionMs: number;
  waitMs: number;
  criticalNodeIds: string[];
  bottleneck: boolean;
}

export interface SimulationResult {
  mode: SimulationMode;
  completionMs: number;
  criticalPath: string[];
  entries: TimelineEntry[];
  stages: StageReport[];
  warnings: string[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export const EXAMPLE_PROJECT: LatencyProject = {
  id: "project-latency-demo",
  title: "商品详情页 · 首屏预算",
  concurrencyLimit: null,
  createdAt: 1_728_000_000_000,
  updatedAt: 1_728_000_000_000,
  scenarios: [],
  stages: [
    { id: "stage-first-paint", name: "首屏" },
    { id: "stage-interactive", name: "可交互" },
    { id: "stage-secondary", name: "次要内容" },
  ],
  nodes: [
    {
      id: "session",
      name: "会话校验",
      durationMs: 280,
      jitterMs: 80,
      dependencyIds: [],
      timeoutMs: 800,
      retryCount: 1,
      failureRate: 1,
      stageId: "stage-first-paint",
    },
    {
      id: "flags",
      name: "功能开关",
      durationMs: 210,
      jitterMs: 50,
      dependencyIds: [],
      timeoutMs: 700,
      retryCount: 0,
      failureRate: 0,
      stageId: "stage-first-paint",
    },
    {
      id: "profile",
      name: "用户资料",
      durationMs: 460,
      jitterMs: 120,
      dependencyIds: ["session"],
      timeoutMs: 1200,
      retryCount: 1,
      failureRate: 3,
      stageId: "stage-interactive",
    },
    {
      id: "catalog",
      name: "商品目录",
      durationMs: 740,
      jitterMs: 180,
      dependencyIds: ["session"],
      timeoutMs: 1400,
      retryCount: 1,
      failureRate: 2,
      stageId: "stage-interactive",
    },
    {
      id: "recommend",
      name: "个性推荐",
      durationMs: 520,
      jitterMs: 220,
      dependencyIds: ["flags", "profile"],
      timeoutMs: 1500,
      retryCount: 1,
      failureRate: 5,
      fallbackNodeId: "catalog",
      stageId: "stage-secondary",
    },
  ],
};

export function createEmptyProject(now = Date.now()): LatencyProject {
  return {
    id: `project-${crypto.randomUUID()}`,
    title: "未命名链路",
    nodes: [],
    stages: [],
    concurrencyLimit: null,
    scenarios: [],
    createdAt: now,
    updatedAt: now,
  };
}
