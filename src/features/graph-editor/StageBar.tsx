import { ArrowDown, ArrowUp, Layers, Plus, X } from "lucide-react";
import type { LatencyProject } from "../../shared/domain/types";
import { UNASSIGNED_STAGE_NAME } from "../../shared/domain/stages";

interface Props {
  project: LatencyProject;
  onAddStage: () => void;
  onRenameStage: (id: string, name: string) => void;
  onMoveStage: (id: string, offset: -1 | 1) => void;
  onRemoveStage: (id: string) => void;
}

export default function StageBar({
  project,
  onAddStage,
  onRenameStage,
  onMoveStage,
  onRemoveStage,
}: Props) {
  const unassigned = project.nodes.filter(
    (node) =>
      !node.stageId ||
      !project.stages.some((stage) => stage.id === node.stageId),
  ).length;
  return (
    <div className="stage-board">
      <div className="board-topline">
        <div>
          <span className="section-label">链路分段</span>
          <span className="muted-count">
            {project.stages.length
              ? `${project.stages.length} STAGES`
              : "未启用"}
          </span>
        </div>
        <button
          className="button button-neutral stage-add"
          onClick={onAddStage}
        >
          <Plus size={13} /> 添加分段
        </button>
      </div>
      {project.stages.length ? (
        <div className="stage-list">
          {project.stages.map((stage, index) => {
            const count = project.nodes.filter(
              (node) => node.stageId === stage.id,
            ).length;
            return (
              <div className="stage-row" key={stage.id}>
                <span className="stage-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <input
                  className="text-input stage-name-input"
                  value={stage.name}
                  placeholder="分段名称"
                  onChange={(event) =>
                    onRenameStage(stage.id, event.target.value)
                  }
                />
                <span className="stage-count">{count} 节点</span>
                <span className="stage-actions">
                  <button
                    className="icon-button"
                    title="前移分段"
                    aria-label={`前移分段 ${stage.name}`}
                    disabled={index === 0}
                    onClick={() => onMoveStage(stage.id, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title="后移分段"
                    aria-label={`后移分段 ${stage.name}`}
                    disabled={index === project.stages.length - 1}
                    onClick={() => onMoveStage(stage.id, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="icon-button danger-button"
                    title="删除分段"
                    aria-label={`删除分段 ${stage.name}`}
                    onClick={() => onRemoveStage(stage.id)}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
            );
          })}
          {unassigned > 0 && (
            <div className="stage-unassigned">
              <Layers size={12} /> {unassigned} 个请求未归属分段，推演时归入「
              {UNASSIGNED_STAGE_NAME}」组
            </div>
          )}
        </div>
      ) : (
        <p className="stage-hint">
          按首屏、可交互、次要内容等阶段给请求分组；推演会给出各分段的完成时间。
        </p>
      )}
    </div>
  );
}
