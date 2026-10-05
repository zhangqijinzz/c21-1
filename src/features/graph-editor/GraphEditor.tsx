import { useState } from "react";
import { Plus, GitBranch, CircleHelp } from "lucide-react";
import type { LatencyProject, RequestNode } from "../../shared/domain/types";
import type { GraphAnalysis } from "../../shared/domain/graph";
import NodeInspector from "./NodeInspector";
import SegmentManager from "./SegmentManager";

interface Props {
  project: LatencyProject;
  graph: GraphAnalysis;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<RequestNode>) => void;
  onDelete: (id: string) => void;
  onDependency: (id: string, dependencyId: string) => void;
  onAddSegment: (name: string) => boolean;
  onRenameSegment: (id: string, name: string) => void;
  onRemoveSegment: (id: string) => void;
  onMoveSegment: (id: string, direction: -1 | 1) => void;
  onAssignSegment: (nodeId: string, segmentId: string | undefined) => void;
}

export default function GraphEditor({
  project,
  graph,
  onAdd,
  onPatch,
  onDelete,
  onDependency,
  onAddSegment,
  onRenameSegment,
  onRemoveSegment,
  onMoveSegment,
  onAssignSegment,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const selected =
    project.nodes.find((node) => node.id === selectedId) ?? project.nodes[0];
  const segmentName = (segmentId?: string) =>
    project.segments.find((segment) => segment.id === segmentId)?.name;
  const conflictNodeIds = new Set(
    graph.segmentConflicts.flatMap((conflict) => [
      conflict.fromNodeId,
      conflict.toNodeId,
    ]),
  );
  const segmentError = graph.validation.errors.find((error) =>
    error.includes("分段"),
  );
  return (
    <section className="module-page editor-page">
      <div className="module-heading">
        <div>
          <span className="eyebrow">02 / DEPENDENCIES</span>
          <h1>请求编排</h1>
          <p>整理启动顺序与前置条件；没有依赖的入口会并发开始。</p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus size={16} /> 添加请求
        </button>
      </div>
      <SegmentManager
        project={project}
        onAdd={onAddSegment}
        onRename={onRenameSegment}
        onRemove={onRemoveSegment}
        onMove={onMoveSegment}
      />
      <div className="editor-layout">
        <div className="node-board">
          <div className="board-topline">
            <div>
              <span className="section-label">依赖拓扑</span>
              <span className="muted-count">{project.nodes.length} NODES</span>
            </div>
            <span
              className={`graph-health ${graph.validation.errors.length ? "danger" : ""}`}
            >
              <i />
              {graph.validation.errors.length ? "需要修复" : "DAG 就绪"}
            </span>
          </div>
          {!project.nodes.length ? (
            <div className="empty-card">
              <GitBranch size={26} />
              <h3>从第一个请求开始</h3>
              <p>添加节点并设置预计耗时，之后可以逐个勾选前置依赖。</p>
              <button className="button button-primary" onClick={onAdd}>
                <Plus size={15} /> 创建请求节点
              </button>
            </div>
          ) : (
            <div className="node-stack">
              {project.nodes.map((node, index) => {
                const dependencies = node.dependencyIds
                  .map(
                    (id) => project.nodes.find((item) => item.id === id)?.name,
                  )
                  .filter(Boolean);
                const stageName = segmentName(node.segmentId);
                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    className={`node-card ${selected?.id === node.id ? "active" : ""} ${graph.cycle.includes(node.id) ? "cycle-conflict" : ""} ${conflictNodeIds.has(node.id) ? "segment-conflict" : ""}`}
                  >
                    <span className="node-rail">
                      <span className="node-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <i className={`node-led led-${index % 4}`} />
                    </span>
                    <span className="node-card-main">
                      <strong>{node.name}</strong>
                      <span>
                        {dependencies.length ? (
                          <>
                            {dependencies.map((name) => (
                              <em key={name}>{name}</em>
                            ))}
                          </>
                        ) : (
                          <em className="entry-tag">入口 · 可并发启动</em>
                        )}
                      </span>
                    </span>
                    <span
                      className={`node-stage-badge ${stageName ? "" : "is-unassigned"}`}
                    >
                      {stageName ?? "未分段"}
                    </span>
                    <span className="node-card-metric">
                      <b>{node.durationMs}</b>
                      <small>ms</small>
                    </span>
                    <span className="node-card-more">···</span>
                  </button>
                );
              })}
            </div>
          )}
          {graph.validation.errors.length > 0 && (
            <div className="inline-error">
              {segmentError ?? graph.validation.errors[0]}
            </div>
          )}
          {project.nodes.length > 0 && (
            <div className="graph-hint">
              <CircleHelp size={14} />{" "}
              点击节点编辑参数与分段归属；右侧勾选依赖建立连线。
            </div>
          )}
        </div>
        {selected && (
          <NodeInspector
            project={project}
            node={selected}
            onPatch={onPatch}
            onDelete={onDelete}
            onDependency={onDependency}
            onAssignSegment={onAssignSegment}
          />
        )}
      </div>
      {graph.validation.warnings.length > 0 && (
        <div className="warning-strip">{graph.validation.warnings[0]}</div>
      )}
    </section>
  );
}
