import type {
  LatencyProject,
  SimulationResult,
  StageReport,
  TimelineEntry,
} from "../../shared/domain/types";

interface Props {
  project: LatencyProject;
  result: SimulationResult;
}

function formatTime(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

interface TimelineGroup {
  report: StageReport | null;
  entries: { entry: TimelineEntry; index: number }[];
}

export default function Timeline({ project, result }: Props) {
  const max = Math.max(1, result.completionMs);
  const critical = new Set(result.criticalPath);
  const marks = [0, 0.25, 0.5, 0.75, 1];
  const indexed = result.entries.map((entry, index) => ({ entry, index }));
  const groups: TimelineGroup[] = result.stages.length
    ? result.stages.map((report) => ({
        report,
        entries: indexed.filter(
          ({ entry }) => entry.stageId === report.stageId,
        ),
      }))
    : [{ report: null, entries: indexed }];

  const renderRow = (entry: TimelineEntry, index: number) => {
    const node = project.nodes.find((item) => item.id === entry.nodeId);
    if (!node) return null;
    const start = (entry.startMs / max) * 100;
    const width = Math.max(1.2, (entry.modeledDurationMs / max) * 100);
    return (
      <div className="timeline-row" key={entry.nodeId}>
        <div className="timeline-name">
          <span className={`timeline-icon tone-${index % 4}`}>
            {node.name.slice(0, 1)}
          </span>
          <span>
            <b>{node.name}</b>
            <small>
              {entry.waitMs > 0
                ? `排队 ${formatTime(entry.waitMs)}`
                : "就绪后启动"}
            </small>
          </span>
        </div>
        <div className="timeline-track">
          <div className="timeline-grid" />
          {entry.waitMs > 0 && (
            <div
              className="wait-bar"
              style={{
                left: `${Math.max(0, ((entry.startMs - entry.waitMs) / max) * 100)}%`,
                width: `${(entry.waitMs / max) * 100}%`,
              }}
            />
          )}
          <div
            className={`duration-bar ${critical.has(entry.nodeId) ? "is-critical" : ""} tone-${index % 4}`}
            style={{
              left: `${start}%`,
              width: `${Math.min(width, 100 - start)}%`,
            }}
          >
            <span>{formatTime(entry.modeledDurationMs)}</span>
          </div>
        </div>
        <div className="timeline-end">{formatTime(entry.endMs)}</div>
      </div>
    );
  };

  return (
    <div className="timeline-card">
      <div className="timeline-head">
        <div>
          <span className="section-label">执行时序</span>
          <span className="timeline-caption">
            {result.stages.length ? "按分段成组排布" : "按依赖与并发预算排布"}
          </span>
        </div>
        <div className="timeline-legend">
          <span>
            <i className="legend-normal" /> 请求耗时
          </span>
          <span>
            <i className="legend-critical" /> 关键路径
          </span>
          <span>
            <i className="legend-wait" /> 等待
          </span>
        </div>
      </div>
      <div className="timeline-axis">
        <div className="axis-label">REQUEST</div>
        <div className="axis-track">
          {marks.map((mark) => (
            <span key={mark} style={{ left: `${mark * 100}%` }}>
              {formatTime(max * mark)}
            </span>
          ))}
        </div>
        <div className="axis-end">DURATION</div>
      </div>
      {groups.map((group) => (
        <div
          className="timeline-group"
          key={
            group.report ? (group.report.stageId ?? "unassigned") : "ungrouped"
          }
        >
          {group.report && (
            <div className="timeline-group-head">
              <span className="timeline-group-name">
                <i />
                {group.report.name}
              </span>
              <span className="timeline-group-meta">
                {group.report.nodeIds.length} 个请求 · 完成于{" "}
                {formatTime(group.report.completionMs)}
                {group.report.bottleneck && <em>拖慢整体</em>}
              </span>
            </div>
          )}
          {group.entries.map(({ entry, index }) => renderRow(entry, index))}
        </div>
      ))}
      {!result.entries.length && (
        <div className="timeline-empty">修复链路配置后即可生成时序预览。</div>
      )}
    </div>
  );
}
