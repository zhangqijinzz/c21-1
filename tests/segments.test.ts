import { describe, expect, it } from "vitest";
import { analyzeGraph } from "../src/shared/domain/graph";
import { EXAMPLE_PROJECT } from "../src/shared/domain/types";
import { simulateProject } from "../src/shared/domain/simulation";
import {
  addSegment,
  moveSegment,
  removeSegment,
  renameSegment,
} from "../src/features/graph-editor/segmentViewModel";

describe("chain segments", () => {
  it("computes per-segment completion stats, ordering, and the bottleneck", () => {
    const result = simulateProject(EXAMPLE_PROJECT, "expected");
    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((stat) => stat.name)).toEqual([
      "首屏",
      "可交互",
      "次要内容",
    ]);
    for (const stat of result.segments) {
      expect(stat.completionMs).toBeGreaterThanOrEqual(stat.startMs);
      expect(stat.completionMs).toBeLessThanOrEqual(result.completionMs + 1e-6);
    }
    const firstScreen = result.segments[0]!;
    expect(firstScreen?.nodeCount).toBe(2);
    expect(firstScreen?.completionMs).toBe(
      Math.max(
        ...result.entries
          .filter(
            (entry) =>
              EXAMPLE_PROJECT.nodes.find((node) => node.id === entry.nodeId)
                ?.segmentId === firstScreen.segmentId,
          )
          .map((entry) => entry.endMs),
      ),
    );
    // 恰好一个瓶颈分段。
    expect(result.segments.filter((stat) => stat.isBottleneck)).toHaveLength(1);
    expect(
      result.segments.find((stat) => stat.isBottleneck)?.criticalMs,
    ).toBeGreaterThan(0);
  });

  it("groups unassigned nodes into an unassigned pseudo segment", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.map((node, index) =>
        index === 0 ? { ...node, segmentId: undefined } : node,
      ),
    };
    const analysis = analyzeGraph(project);
    expect(analysis.validation.warnings.join(" ")).toContain("尚未归属分段");
    const result = simulateProject(project);
    const unassigned = result.segments.find((stat) => stat.unassigned);
    expect(unassigned?.nodeCount).toBe(1);
    expect(unassigned?.name).toBe("未分段");
  });

  it("rejects duplicate and empty segment names with explicit errors", () => {
    const added = addSegment(EXAMPLE_PROJECT, "首屏");
    expect(added.error).toContain("重名");
    expect(added.project).toBe(EXAMPLE_PROJECT);
    expect(addSegment(EXAMPLE_PROJECT, "  ").error).toContain("不能为空");
    const renamed = renameSegment(
      EXAMPLE_PROJECT,
      EXAMPLE_PROJECT.segments[0]!.id,
      "可交互",
    );
    expect(renamed.error).toContain("唯一");
    const analysis = analyzeGraph({
      ...EXAMPLE_PROJECT,
      segments: [
        { id: "a", name: "同一段" },
        { id: "b", name: "同一段" },
      ],
      nodes: EXAMPLE_PROJECT.nodes.map((node) => ({
        ...node,
        segmentId: "a",
      })),
    });
    expect(analysis.validation.errors.join(" ")).toContain("分段重名");
  });

  it("blocks reordering when segment order contradicts dependency direction", () => {
    // 将“首屏”移到“可交互”之后：profile/catalog 属于可交互且依赖首屏的 session，矛盾。
    const moved = moveSegment(EXAMPLE_PROJECT, "segment-first-screen", 1);
    expect(moved.error).toContain("顺序调整被拒绝");
    expect(moved.project).toBe(EXAMPLE_PROJECT);
    const reordered = {
      ...EXAMPLE_PROJECT,
      segments: [
        EXAMPLE_PROJECT.segments[1]!,
        EXAMPLE_PROJECT.segments[0]!,
        EXAMPLE_PROJECT.segments[2]!,
      ],
    };
    const analysis = analyzeGraph(reordered);
    expect(analysis.segmentConflicts.length).toBeGreaterThan(0);
    expect(analysis.validation.errors.join(" ")).toContain(
      "分段顺序与依赖方向矛盾",
    );
    // 矛盾属于硬错误：推演不产出时间线。
    expect(simulateProject(reordered).entries).toHaveLength(0);
  });

  it("accepts order changes that stay consistent with dependencies", () => {
    // 构造：a → b → c 三个串行分段，把 b/c 之间加入一个新分段不会矛盾；
    // 这里验证同方向调整（最后一个分段前移到“仍在其依赖之后”的位置）可通过。
    const project: typeof EXAMPLE_PROJECT = {
      ...EXAMPLE_PROJECT,
      segments: [
        { id: "s1", name: "一" },
        { id: "s2", name: "二" },
        { id: "s3", name: "三" },
      ],
      nodes: [
        {
          id: "n1",
          name: "N1",
          durationMs: 100,
          jitterMs: 0,
          dependencyIds: [],
          timeoutMs: 500,
          retryCount: 0,
          failureRate: 0,
          segmentId: "s1",
        },
        {
          id: "n2",
          name: "N2",
          durationMs: 100,
          jitterMs: 0,
          dependencyIds: ["n1"],
          timeoutMs: 500,
          retryCount: 0,
          failureRate: 0,
          segmentId: "s3",
        },
      ],
    };
    // 初始顺序 一/二/三 与 n2 → n1 一致；把空的“二”后移到最后不改变依赖关系。
    const moved = moveSegment(project, "s2", 1);
    expect(moved.error).toBeUndefined();
    expect(moved.project.segments.map((segment) => segment.id)).toEqual([
      "s1",
      "s3",
      "s2",
    ]);
    expect(analyzeGraph(moved.project).segmentConflicts).toHaveLength(0);
    // 把“三”前移到“一”之前（两次前移），第二次会与 n2 → n1 矛盾并被拒绝。
    const once = moveSegment(project, "s3", -1);
    expect(once.error).toBeUndefined();
    const twice = moveSegment(once.project, "s3", -1);
    expect(twice.error).toContain("顺序调整被拒绝");
    expect(twice.project).toBe(once.project);
  });

  it("removing a segment keeps its nodes and returns them to unassigned", () => {
    const next = removeSegment(EXAMPLE_PROJECT, "segment-first-screen");
    expect(
      next.segments.some((segment) => segment.id === "segment-first-screen"),
    ).toBe(false);
    expect(next.nodes).toHaveLength(EXAMPLE_PROJECT.nodes.length);
    expect(
      next.nodes.filter((node) => node.segmentId === undefined),
    ).toHaveLength(2);
  });

  it("flags nodes referencing a segment that no longer exists", () => {
    const project = {
      ...EXAMPLE_PROJECT,
      nodes: [
        { ...EXAMPLE_PROJECT.nodes[0]!, segmentId: "gone" },
        ...EXAMPLE_PROJECT.nodes.slice(1),
      ],
    };
    expect(analyzeGraph(project).validation.errors.join(" ")).toContain(
      "所属分段不存在",
    );
  });
});
