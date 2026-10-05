export const UNASSIGNED_SEGMENT_ID = "__unassigned__";
export const UNASSIGNED_SEGMENT_NAME = "未分段";

export interface ChainSegment {
  id: string;
  name: string;
}

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
  segmentId?: string;
}

/** 单个分段在一次推演中的时间预算，order 为分段在整条链路中的先后位置（未分段排在最后）。 */
export interface SegmentStat {
  segmentId: string;
  name: string;
  order: number;
  startMs: number;
  completionMs: number;
  nodeCount: number;
  /** 段内节点排队等待合计。 */
  waitMs: number;
  /** 段内落在关键链路上的节点耗时合计。 */
  criticalMs: number;
  criticalNodeCount: number;
  isBottleneck: boolean;
  unassigned: boolean;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: number;
  concurrencyLimit: number | null;
  nodes: RequestNode[];
  segments: ChainSegment[];
  segmentStats: SegmentStat[];
  completionMs: number;
  criticalPath: string[];
}

export interface LatencyProject {
  id: string;
  title: string;
  nodes: RequestNode[];
  segments: ChainSegment[];
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
  startMs: number;
  endMs: number;
  modeledDurationMs: number;
  waitMs: number;
  criticalPredecessorId?: string;
}

export interface SimulationResult {
  mode: SimulationMode;
  completionMs: number;
  criticalPath: string[];
  entries: TimelineEntry[];
  segments: SegmentStat[];
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
  segments: [
    { id: "segment-first-screen", name: "首屏" },
    { id: "segment-interactive", name: "可交互" },
    { id: "segment-secondary", name: "次要内容" },
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
      segmentId: "segment-first-screen",
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
      segmentId: "segment-first-screen",
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
      segmentId: "segment-interactive",
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
      segmentId: "segment-interactive",
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
      segmentId: "segment-secondary",
    },
  ],
};

export function createEmptyProject(now = Date.now()): LatencyProject {
  return {
    id: `project-${crypto.randomUUID()}`,
    title: "未命名链路",
    nodes: [],
    segments: [],
    concurrencyLimit: null,
    scenarios: [],
    createdAt: now,
    updatedAt: now,
  };
}
