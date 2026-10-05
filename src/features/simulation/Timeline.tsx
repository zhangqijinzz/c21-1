import type {
  LatencyProject,
  SegmentStat,
  SimulationResult,
  TimelineEntry,
} from "../../shared/domain/types";
import { UNASSIGNED_SEGMENT_ID } from "../../shared/domain/types";

interface Props {
  project: LatencyProject;
  result: SimulationResult;
}

function formatTime(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

interface SegmentGroup {
  stat: SegmentStat;
  rows: { entry: TimelineEntry; nodeName: string; tone: number }[];
}

export default function Timeline({ project, result }: Props) {
  const max = Math.max(1, result.completionMs);
  const critical = new Set(result.criticalPath);
  const marks = [0, 0.25, 0.5, 0.75, 1];
  const knownSegments = new Set(project.segments.map((segment) => segment.id));
  const segmentOf = (entry: TimelineEntry): string => {
    const node = project.nodes.find((item) => item.id === entry.nodeId);
    return node?.segmentId && knownSegments.has(node.segmentId)
      ? node.segmentId
      : UNASSIGNED_SEGMENT_ID;
  };
  const groups = new Map<string, SegmentGroup>();
  for (const stat of result.segments) {
    groups.set(stat.segmentId, { stat, rows: [] });
  }
  // 色调按各分段内出现顺序循环，便于在成组时间线里区分相邻节点。
  const toneCounters = new Map<string, number>();
  for (const entry of result.entries) {
    const segmentId = segmentOf(entry);
    const node = project.nodes.find((item) => item.id === entry.nodeId);
    if (!node) continue;
    const group = groups.get(segmentId);
    if (!group) continue;
    const tone = (toneCounters.get(segmentId) ?? 0) % 4;
    toneCounters.set(segmentId, tone + 1);
    group.rows.push({ entry, nodeName: node.name, tone });
  }
  const visibleGroups = [...groups.values()].filter(
    (group) => group.rows.length,
  );

  return (
    <div className="timeline-card">
      <div className="timeline-head">
        <div>
          <span className="section-label">执行时序</span>
          <span className="timeline-caption">
            按分段成组 · 依赖与并发预算排布
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
        <div className="axis-label">REQUEST / STAGE</div>
        <div className="axis-track">
          {marks.map((mark) => (
            <span key={mark} style={{ left: `${mark * 100}%` }}>
              {formatTime(max * mark)}
            </span>
          ))}
        </div>
        <div className="axis-end">DURATION</div>
      </div>
      {visibleGroups.map((group) => {
        const { stat } = group;
        return (
          <section
            className={`timeline-group ${stat.isBottleneck ? "is-bottleneck" : ""} ${stat.unassigned ? "is-unassigned" : ""}`}
            key={stat.segmentId}
          >
            <header className="timeline-group-head">
              <span className="timeline-group-index">{stat.order + 1}</span>
              <div className="timeline-group-title">
                <strong>{stat.name}</strong>
                <small>
                  {stat.nodeCount} 节点 · 等待合计 {formatTime(stat.waitMs)} ·
                  关键链路 {formatTime(stat.criticalMs)}
                </small>
              </div>
              <span
                className={`timeline-group-time ${stat.isBottleneck ? "is-bottleneck" : ""}`}
              >
                {stat.isBottleneck && <em>拖后腿</em>}
                完成 {formatTime(stat.completionMs)}
              </span>
            </header>
            {group.rows.map(({ entry, nodeName, tone }) => {
              const start = (entry.startMs / max) * 100;
              const width = Math.max(
                1.2,
                (entry.modeledDurationMs / max) * 100,
              );
              return (
                <div className="timeline-row" key={entry.nodeId}>
                  <div className="timeline-name">
                    <span className={`timeline-icon tone-${tone}`}>
                      {nodeName.slice(0, 1)}
                    </span>
                    <span>
                      <b>{nodeName}</b>
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
                      className={`duration-bar ${critical.has(entry.nodeId) ? "is-critical" : ""} tone-${tone}`}
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
            })}
          </section>
        );
      })}
      {!result.entries.length && (
        <div className="timeline-empty">修复链路配置后即可生成时序预览。</div>
      )}
    </div>
  );
}
