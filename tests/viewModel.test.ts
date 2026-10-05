import { describe, expect, it } from "vitest";
import {
  createProject,
  duplicateProject,
  selectProject,
} from "../src/features/projects/projectViewModel";
import {
  compareScenarios,
  restoreScenario,
  saveScenario,
} from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";
import { EXAMPLE_PROJECT } from "../src/shared/domain/types";

describe("project and scenario view models", () => {
  it("creates a project and switches the active project", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const created = createProject(initial, 100);
    expect(created.projects).toHaveLength(2);
    expect(created.activeProjectId).not.toBe(EXAMPLE_PROJECT.id);
    expect(selectProject(created, EXAMPLE_PROJECT.id).activeProjectId).toBe(
      EXAMPLE_PROJECT.id,
    );
  });

  it("duplicates a project and remaps its dependency identities", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const duplicated = duplicateProject(initial, EXAMPLE_PROJECT, 10);
    const copy = duplicated.projects[0];
    expect(copy?.nodes[2]?.dependencyIds).toEqual([copy?.nodes[0]?.id]);
    expect(copy?.nodes[4]?.fallbackNodeId).toBe(copy?.nodes[3]?.id);
    expect(copy?.id).not.toBe(EXAMPLE_PROJECT.id);
    expect(copy?.scenarios).toEqual([]);
  });

  it("saves a complete snapshot and restores its parameters", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const result = simulateProject(baseline);
    const saved = saveScenario(baseline, result, "并发方案");
    expect(saved.scenarios).toHaveLength(1);
    const changed = {
      ...saved,
      nodes: saved.nodes.map((node) => ({ ...node, durationMs: 999 })),
    };
    const restored = restoreScenario(changed, saved.scenarios[0]?.id ?? "");
    expect(restored.nodes[0]?.durationMs).toBe(baseline.nodes[0]?.durationMs);
  });

  it("describes node and concurrency differences between snapshots", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const baselineSnapshot = saveScenario(
      baseline,
      simulateProject(baseline),
      "不限并发",
    ).scenarios[0];
    const changed = {
      ...baseline,
      concurrencyLimit: 1,
      nodes: baseline.nodes.map((node, index) =>
        index === 0 ? { ...node, durationMs: 900 } : node,
      ),
    };
    const changedSnapshot = saveScenario(
      changed,
      simulateProject(changed),
      "串行优化",
    ).scenarios[0];
    if (!baselineSnapshot || !changedSnapshot)
      throw new Error("Scenario fixtures should be saved");
    const comparison = compareScenarios(baselineSnapshot, changedSnapshot);
    expect(comparison.deltaMs).toBeGreaterThan(0);
    expect(comparison.changes.join(" ")).toContain("并发上限");
    expect(comparison.changes.join(" ")).toContain("耗时");
  });

  it("stores segments and segment stats in snapshots and restores them", () => {
    const result = simulateProject(EXAMPLE_PROJECT);
    const saved = saveScenario(EXAMPLE_PROJECT, result, "分段方案");
    const snapshot = saved.scenarios[0];
    expect(snapshot?.segments).toEqual(EXAMPLE_PROJECT.segments);
    expect(snapshot?.segmentStats.map((stat) => stat.name)).toEqual([
      "首屏",
      "可交互",
      "次要内容",
    ]);
    // 当前项目删掉分段后恢复快照，分段与归属应一并回来。
    const stripped: typeof EXAMPLE_PROJECT = {
      ...saved,
      segments: [],
      nodes: saved.nodes.map((node) => ({ ...node, segmentId: undefined })),
    };
    const restored = restoreScenario(stripped, snapshot!.id);
    expect(restored.segments).toEqual(EXAMPLE_PROJECT.segments);
    expect(restored.nodes.every((node) => node.segmentId !== undefined)).toBe(
      true,
    );
  });

  it("compares per-segment completion and still compares legacy snapshots without segments", () => {
    const result = simulateProject(EXAMPLE_PROJECT);
    const snapshot = saveScenario(EXAMPLE_PROJECT, result, "现状")
      .scenarios[0]!;
    const improved: typeof EXAMPLE_PROJECT = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.map((node) =>
        node.id === "catalog" ? { ...node, durationMs: 400 } : node,
      ),
    };
    const improvedSnapshot = saveScenario(
      improved,
      simulateProject(improved),
      "优化目录",
    ).scenarios[0]!;
    const comparison = compareScenarios(snapshot, improvedSnapshot);
    expect(comparison.segmentComparisons).toHaveLength(3);
    const interactive = comparison.segmentComparisons.find(
      (item) => item.name === "可交互",
    );
    expect(interactive?.deltaMs).toBeLessThan(0);

    // 老快照（没有 segments / segmentStats）也能参与对比，不抛错。
    const legacy = {
      ...snapshot,
      segments: [],
      segmentStats: [],
    };
    const legacyComparison = compareScenarios(legacy, improvedSnapshot);
    expect(legacyComparison.changes.join(" ")).toContain("链路分段");
    expect(legacyComparison.segmentComparisons.length).toBeGreaterThan(0);
  });
});
