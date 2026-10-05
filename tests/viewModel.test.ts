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

  it("keeps stage definitions and per-stage completions in snapshots", () => {
    const result = simulateProject(EXAMPLE_PROJECT);
    const saved = saveScenario(EXAMPLE_PROJECT, result, "分段基线");
    const snapshot = saved.scenarios[0];
    expect(snapshot?.stages).toEqual(EXAMPLE_PROJECT.stages);
    expect(snapshot?.stageCompletions.map((item) => item.name)).toEqual([
      "首屏",
      "可交互",
      "次要内容",
    ]);
    expect(snapshot?.stageCompletions[2]?.completionMs).toBeCloseTo(
      result.completionMs,
      5,
    );
    const stripped = { ...saved, stages: [], scenarios: saved.scenarios };
    const restored = restoreScenario(stripped, snapshot?.id ?? "");
    expect(restored.stages).toEqual(EXAMPLE_PROJECT.stages);
  });

  it("describes stage renames, reorders, and node moves between snapshots", () => {
    const baseline = saveScenario(
      EXAMPLE_PROJECT,
      simulateProject(EXAMPLE_PROJECT),
      "基线",
    ).scenarios[0];
    const changed = {
      ...EXAMPLE_PROJECT,
      stages: [
        { id: "stage-interactive", name: "可交互" },
        { id: "stage-first-paint", name: "首屏框架" },
        { id: "stage-secondary", name: "次要内容" },
      ],
      nodes: EXAMPLE_PROJECT.nodes.map((node) =>
        node.id === "recommend"
          ? { ...node, stageId: "stage-interactive" }
          : node,
      ),
    };
    const changedSnapshot = saveScenario(
      changed,
      simulateProject(changed),
      "调序",
    ).scenarios[0];
    if (!baseline || !changedSnapshot)
      throw new Error("Scenario fixtures should be saved");
    const comparison = compareScenarios(baseline, changedSnapshot);
    const text = comparison.changes.join(" ");
    expect(text).toContain("分段「首屏」→「首屏框架」");
    expect(text).toContain("分段顺序已调整");
    expect(text).toContain("个性推荐 · 分段 次要内容 → 可交互");
    expect(comparison.stageDeltas).toHaveLength(3);
    const secondary = comparison.stageDeltas.find(
      (delta) => delta.name === "次要内容",
    );
    expect(secondary?.baselineMs).not.toBeNull();
    expect(secondary?.comparisonMs).toBeNull();
  });

  it("compares legacy snapshots without stage data against staged ones", () => {
    const staged = saveScenario(
      EXAMPLE_PROJECT,
      simulateProject(EXAMPLE_PROJECT),
      "分段方案",
    ).scenarios[0];
    if (!staged) throw new Error("Scenario fixture should be saved");
    // 老快照经仓储解析后分段字段为空数组
    const legacy = {
      ...staged,
      id: "legacy-snapshot",
      stages: [],
      stageCompletions: [],
    };
    const comparison = compareScenarios(legacy, staged);
    expect(comparison.stageDeltas).toHaveLength(3);
    expect(comparison.stageDeltas[0]?.baselineMs).toBeNull();
    expect(comparison.stageDeltas[0]?.comparisonMs).not.toBeNull();
    expect(comparison.changes.join(" ")).toContain("新增分段");
    const reverse = compareScenarios(staged, legacy);
    expect(reverse.stageDeltas[0]?.comparisonMs).toBeNull();
    expect(reverse.changes.join(" ")).toContain("已移除");
  });
});
