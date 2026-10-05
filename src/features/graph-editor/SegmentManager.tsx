import { useState } from "react";
import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from "lucide-react";
import type { LatencyProject } from "../../shared/domain/types";
import { nodeCountBySegment } from "./segmentViewModel";

interface Props {
  project: LatencyProject;
  onAdd: (name: string) => boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export default function SegmentManager({
  project,
  onAdd,
  onRename,
  onRemove,
  onMove,
}: Props) {
  const [name, setName] = useState("");
  const counts = nodeCountBySegment(project);
  const unassignedCount = project.nodes.filter(
    (node) => node.segmentId === undefined,
  ).length;
  return (
    <div className="segment-card">
      <div className="segment-card-head">
        <div>
          <span className="section-label">
            <Layers size={11} /> 链路分段
          </span>
          <span className="timeline-caption">
            按评审口径划分首屏、可交互、次要内容；顺序即先后
          </span>
        </div>
        <span className="muted-count">{project.segments.length} STAGES</span>
      </div>
      {project.segments.length > 0 && (
        <ol className="segment-order-list">
          {project.segments.map((segment, index) => {
            const count = counts.get(segment.id) ?? 0;
            return (
              <li
                key={segment.id}
                className="segment-order-row"
                style={{ ["--stage-index" as string]: index + 1 }}
              >
                <span className="segment-order-no">{index + 1}</span>
                <input
                  className="text-input segment-name-input"
                  value={segment.name}
                  aria-label={`分段 ${index + 1} 名称`}
                  onChange={(event) => onRename(segment.id, event.target.value)}
                />
                <span
                  className={`segment-node-count ${count === 0 ? "is-empty" : ""}`}
                >
                  {count} 节点
                </span>
                <span className="segment-order-actions">
                  <button
                    className="icon-button"
                    title="前移"
                    aria-label={`将 ${segment.name} 前移`}
                    disabled={index === 0}
                    onClick={() => onMove(segment.id, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title="后移"
                    aria-label={`将 ${segment.name} 后移`}
                    disabled={index === project.segments.length - 1}
                    onClick={() => onMove(segment.id, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="icon-button danger-button"
                    title="删除分段（节点变为未归属）"
                    aria-label={`删除分段 ${segment.name}`}
                    onClick={() => onRemove(segment.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="segment-add-row">
        <input
          className="text-input"
          placeholder="新分段名称，如：首屏"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onAdd(name)) setName("");
          }}
        />
        <button
          className="button button-primary"
          onClick={() => {
            if (onAdd(name)) setName("");
          }}
        >
          <Plus size={14} /> 添加分段
        </button>
      </div>
      <div className="segment-hints">
        {unassignedCount > 0 ? (
          <span className="segment-hint warn">
            {unassignedCount} 个节点未归属，推演时计入“未分段”
          </span>
        ) : project.nodes.length > 0 ? (
          <span className="segment-hint ok">所有节点均已归属分段</span>
        ) : null}
        <span className="segment-hint">
          顺序与依赖方向矛盾的调整会被拒绝；删除分段不会删除节点。
        </span>
      </div>
    </div>
  );
}
