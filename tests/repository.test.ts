import { beforeEach, describe, expect, it } from "vitest";
import { ProjectRepository } from "../src/shared/repositories/projectRepository";
import { simulateProject } from "../src/shared/domain/simulation";
import {
  EXAMPLE_PROJECT,
  type WorkspaceDocument,
} from "../src/shared/domain/types";

class MemoryStorage {
  value: unknown = undefined;
  failWrite = false;
  async read(): Promise<unknown> {
    return this.value;
  }
  async write(value: WorkspaceDocument): Promise<void> {
    if (this.failWrite) throw new Error("simulated IndexedDB quota failure");
    this.value = structuredClone(value);
  }
}

describe("project repository recovery", () => {
  beforeEach(() => localStorage.clear());

  it("provides a usable example when both stores are empty or damaged", async () => {
    const storage = new MemoryStorage();
    storage.value = { version: 99, projects: "broken" };
    const loaded = await new ProjectRepository(storage).load();
    expect(loaded.recovered).toBe(true);
    expect(loaded.document.projects[0]?.id).toBe(EXAMPLE_PROJECT.id);
    expect(loaded.document.projects[0]?.nodes.length).toBeGreaterThan(0);
  });

  it("restores the local recovery copy when IndexedDB data is malformed", async () => {
    const storage = new MemoryStorage();
    const repository = new ProjectRepository(storage);
    const document: WorkspaceDocument = {
      version: 1,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [structuredClone(EXAMPLE_PROJECT)],
    };
    await repository.save(document);
    storage.value = { version: 1, projects: [{ id: 5, nodes: [] }] };
    const loaded = await repository.load();
    expect(loaded.recovered).toBe(true);
    expect(loaded.document.projects[0]?.nodes).toHaveLength(
      EXAMPLE_PROJECT.nodes.length,
    );
  });

  it("keeps readable projects while dropping malformed project rows and broken edges", async () => {
    const storage = new MemoryStorage();
    storage.value = {
      version: 1,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [
        {
          ...EXAMPLE_PROJECT,
          nodes: [
            { ...EXAMPLE_PROJECT.nodes[0], dependencyIds: ["missing"] },
            { damaged: true },
          ],
        },
        { id: 9, title: null },
      ],
    };
    const loaded = await new ProjectRepository(storage).load();
    expect(loaded.document.projects).toHaveLength(1);
    expect(loaded.document.projects[0]?.nodes).toHaveLength(1);
    expect(loaded.document.projects[0]?.nodes[0]?.dependencyIds).toEqual([]);
    expect(loaded.recovered).toBe(true);
  });

  it("keeps a local recovery copy when IndexedDB saving fails", async () => {
    const storage = new MemoryStorage();
    storage.failWrite = true;
    const repository = new ProjectRepository(storage);
    const document: WorkspaceDocument = {
      version: 1,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [structuredClone(EXAMPLE_PROJECT)],
    };
    await expect(repository.save(document)).rejects.toThrow(
      "IndexedDB quota failure",
    );
    storage.failWrite = false;
    const loaded = await repository.load();
    expect(loaded.document.projects[0]?.id).toBe(EXAMPLE_PROJECT.id);
    expect(loaded.recovered).toBe(true);
  });

  it("opens legacy documents without stage fields without flagging recovery", async () => {
    const storage = new MemoryStorage();
    // 老版本数据：项目、节点、快照都没有任何分段字段
    storage.value = {
      version: 1,
      activeProjectId: "legacy",
      projects: [
        {
          id: "legacy",
          title: "老项目",
          nodes: [
            {
              id: "a",
              name: "请求A",
              durationMs: 100,
              jitterMs: 0,
              dependencyIds: [],
              timeoutMs: 500,
              retryCount: 0,
              failureRate: 0,
            },
          ],
          concurrencyLimit: null,
          scenarios: [
            {
              id: "s1",
              name: "老方案",
              createdAt: 1,
              concurrencyLimit: null,
              nodes: [
                {
                  id: "a",
                  name: "请求A",
                  durationMs: 100,
                  jitterMs: 0,
                  dependencyIds: [],
                  timeoutMs: 500,
                  retryCount: 0,
                  failureRate: 0,
                },
              ],
              completionMs: 100,
              criticalPath: ["a"],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const loaded = await new ProjectRepository(storage).load();
    expect(loaded.recovered).toBe(false);
    const project = loaded.document.projects[0];
    expect(project?.stages).toEqual([]);
    expect(project?.scenarios[0]?.stages).toEqual([]);
    expect(project?.scenarios[0]?.stageCompletions).toEqual([]);
    // 老数据照常推演
    const result = simulateProject(project!);
    expect(result.entries).toHaveLength(1);
    expect(result.completionMs).toBe(100);
    expect(result.stages).toEqual([]);
  });

  it("drops malformed stage rows and clears dangling stage assignments", async () => {
    const storage = new MemoryStorage();
    storage.value = {
      version: 1,
      activeProjectId: "p1",
      projects: [
        {
          id: "p1",
          title: "分段损坏",
          stages: [{ id: "s1", name: "首屏" }, { id: 7 }, "broken"],
          nodes: [
            {
              id: "a",
              name: "请求A",
              durationMs: 100,
              jitterMs: 0,
              dependencyIds: [],
              timeoutMs: 500,
              retryCount: 0,
              failureRate: 0,
              stageId: "ghost-stage",
            },
            {
              id: "b",
              name: "请求B",
              durationMs: 100,
              jitterMs: 0,
              dependencyIds: [],
              timeoutMs: 500,
              retryCount: 0,
              failureRate: 0,
              stageId: "s1",
            },
          ],
          scenarios: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const loaded = await new ProjectRepository(storage).load();
    expect(loaded.recovered).toBe(true);
    const project = loaded.document.projects[0];
    expect(project?.stages).toEqual([{ id: "s1", name: "首屏" }]);
    expect(project?.nodes[0]?.stageId).toBeUndefined();
    expect(project?.nodes[1]?.stageId).toBe("s1");
  });
});
