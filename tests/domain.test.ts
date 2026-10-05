import { describe, expect, it } from "vitest";
import { analyzeGraph } from "../src/shared/domain/graph";
import { EXAMPLE_PROJECT } from "../src/shared/domain/types";
import { simulateProject } from "../src/shared/domain/simulation";
import {
  addRequestNode,
  toggleDependency,
} from "../src/features/graph-editor/graphViewModel";
import {
  moveStage,
  removeStage,
} from "../src/features/graph-editor/stageViewModel";

describe("request dependency graph", () => {
  it("orders a DAG and detects a cycle before simulation", () => {
    const project = structuredClone(EXAMPLE_PROJECT);
    expect(analyzeGraph(project).order).toHaveLength(project.nodes.length);
    const cyclic = {
      ...project,
      nodes: project.nodes.map((node) =>
        node.id === "session" ? { ...node, dependencyIds: ["profile"] } : node,
      ),
    };
    expect(analyzeGraph(cyclic).validation.errors.join(" ")).toContain(
      "循环依赖",
    );
    expect(simulateProject(cyclic).entries).toHaveLength(0);
  });

  it("rejects cyclic edges and accepts valid dependencies", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 3),
    };
    const accepted = toggleDependency(project, "profile", "flags");
    expect(accepted.error).toBeUndefined();
    const rejected = toggleDependency(accepted.project, "flags", "profile");
    expect(rejected.error).toContain("循环");
    expect(rejected.project).toEqual(accepted.project);
  });

  it("schedules independent roots in parallel and serializes them at concurrency one", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2).map((node) => ({
        ...node,
        durationMs: 300,
        jitterMs: 0,
        timeoutMs: 1000,
        retryCount: 0,
        failureRate: 0,
      })),
    };
    const parallel = simulateProject(project);
    const serial = simulateProject({ ...project, concurrencyLimit: 1 });
    expect(parallel.completionMs).toBe(300);
    expect(serial.completionMs).toBe(600);
    expect(serial.entries[1]?.waitMs).toBe(300);
  });

  it("applies jitter modes, timeout caps, bounded retries, and fallback probability", () => {
    const node = {
      id: "a",
      name: "slow",
      durationMs: 1200,
      jitterMs: 400,
      dependencyIds: [],
      timeoutMs: 1000,
      retryCount: 1,
      failureRate: 50,
      fallbackNodeId: "b",
    };
    const fallback = {
      ...node,
      id: "b",
      name: "fallback",
      durationMs: 200,
      jitterMs: 0,
      timeoutMs: 500,
      retryCount: 0,
      failureRate: 0,
      fallbackNodeId: undefined,
    };
    const project = { ...EXAMPLE_PROJECT, nodes: [node, fallback] };
    const low = simulateProject(project, "low");
    const expected = simulateProject(project, "expected");
    const high = simulateProject(project, "high");
    expect(low.completionMs).toBeLessThanOrEqual(expected.completionMs);
    expect(expected.completionMs).toBeLessThanOrEqual(high.completionMs);
    expect(high.warnings.join(" ")).toContain("超时");
    expect(high.entries[0]?.modeledDurationMs).toBe(1650);
    const invalid = {
      ...project,
      nodes: [{ ...node, retryCount: 9 }, fallback],
    };
    expect(simulateProject(invalid).entries).toHaveLength(0);
  });

  it("creates an editable request node with safe defaults", () => {
    const project = { ...EXAMPLE_PROJECT, nodes: [] };
    const next = addRequestNode(project);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]?.durationMs).toBe(400);
    expect(next.nodes[0]?.dependencyIds).toEqual([]);
  });
});

describe("stage segmentation", () => {
  it("reports per-stage completion, composition, and the bottleneck stage", () => {
    const result = simulateProject(EXAMPLE_PROJECT);
    expect(result.stages.map((report) => report.name)).toEqual([
      "首屏",
      "可交互",
      "次要内容",
    ]);
    const [firstPaint, interactive, secondary] = result.stages;
    expect(firstPaint?.nodeIds).toEqual(["session", "flags"]);
    expect(interactive?.nodeIds).toEqual(["profile", "catalog"]);
    expect(secondary?.nodeIds).toEqual(["recommend"]);
    const entryEnd = (id: string) =>
      result.entries.find((entry) => entry.nodeId === id)?.endMs ?? 0;
    expect(firstPaint?.completionMs).toBeCloseTo(entryEnd("session"), 5);
    expect(interactive?.completionMs).toBeCloseTo(entryEnd("catalog"), 5);
    expect(secondary?.completionMs).toBeCloseTo(result.completionMs, 5);
    expect(secondary?.bottleneck).toBe(true);
    expect(firstPaint?.bottleneck).toBe(false);
    expect(firstPaint?.criticalNodeIds).toEqual(["session"]);
    expect(result.entries.every((entry) => entry.stageId !== null)).toBe(true);
  });

  it("groups unassigned nodes under a fallback bucket with a warning", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.map((node) =>
        node.id === "recommend" ? { ...node, stageId: undefined } : node,
      ),
    };
    const result = simulateProject(project);
    expect(result.warnings.join(" ")).toContain("未归属分段");
    const fallback = result.stages.find((report) => report.stageId === null);
    expect(fallback?.name).toBe("未分段");
    expect(fallback?.nodeIds).toEqual(["recommend"]);
    expect(result.completionMs).toBeGreaterThan(0);
  });

  it("rejects duplicate and blank stage names before simulation", () => {
    const duplicated = {
      ...EXAMPLE_PROJECT,
      stages: EXAMPLE_PROJECT.stages.map((stage) => ({
        ...stage,
        name: "首屏",
      })),
    };
    expect(analyzeGraph(duplicated).validation.errors.join(" ")).toContain(
      "名称重复",
    );
    expect(simulateProject(duplicated).entries).toHaveLength(0);
    const blank = {
      ...EXAMPLE_PROJECT,
      stages: [{ id: "s1", name: "  " }],
    };
    expect(analyzeGraph(blank).validation.errors.join(" ")).toContain(
      "分段名称不能为空",
    );
  });

  it("warns when stage order contradicts dependency direction but still simulates", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      stages: [
        { id: "early", name: "首屏" },
        { id: "late", name: "次要内容" },
      ],
      nodes: [
        {
          ...EXAMPLE_PROJECT.nodes[0]!,
          id: "a",
          name: "首屏请求",
          dependencyIds: ["b"],
          stageId: "early",
          fallbackNodeId: undefined,
        },
        {
          ...EXAMPLE_PROJECT.nodes[1]!,
          id: "b",
          name: "后置请求",
          dependencyIds: [],
          stageId: "late",
        },
      ],
    };
    const analysis = analyzeGraph(project);
    expect(analysis.validation.errors).toHaveLength(0);
    expect(analysis.validation.warnings.join(" ")).toContain(
      "分段顺序与依赖方向矛盾",
    );
    const result = simulateProject(project);
    expect(result.entries).toHaveLength(2);
    expect(result.stages.map((report) => report.name)).toEqual([
      "首屏",
      "次要内容",
    ]);
  });

  it("returns no stage reports when the project has no stages", () => {
    const project = { ...EXAMPLE_PROJECT, stages: [] };
    const result = simulateProject(project);
    expect(result.stages).toEqual([]);
    expect(result.entries).toHaveLength(project.nodes.length);
  });

  it("reorders stages and clears assignments when a stage is removed", () => {
    const moved = moveStage(EXAMPLE_PROJECT, "stage-secondary", -1);
    expect(moved.stages.map((stage) => stage.id)).toEqual([
      "stage-first-paint",
      "stage-secondary",
      "stage-interactive",
    ]);
    const clamped = moveStage(EXAMPLE_PROJECT, "stage-first-paint", -1);
    expect(clamped.stages).toEqual(EXAMPLE_PROJECT.stages);
    const removed = removeStage(EXAMPLE_PROJECT, "stage-interactive");
    expect(removed.stages).toHaveLength(2);
    expect(
      removed.nodes.find((node) => node.id === "profile")?.stageId,
    ).toBeUndefined();
    expect(removed.nodes.find((node) => node.id === "session")?.stageId).toBe(
      "stage-first-paint",
    );
  });
});
