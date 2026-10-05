import { AlertTriangle, ChevronRight } from "lucide-react";
import type { SimulationResult } from "../../shared/domain/types";

interface Props {
  result: SimulationResult;
}

function formatTime(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

/** 分段完成时间与整条链路的分段构成；标记关键链路上耗时最长的分段。 */
export default function SegmentBreakdown({ result }: Props) {
  const named = result.segments.filter((stat) => !stat.unassigned);
  const unassigned = result.segments.filter((stat) => stat.unassigned);
  const maxCritical = Math.max(0, ...named.map((stat) => stat.criticalMs));
  if (!result.segments.length) {
    return (
      <div className="segment-breakdown-card">
        <div className="segment-breakdown-head">
          <span className="section-label">链路分段</span>
          <span className="timeline-caption">
            在“请求编排”里创建分段并归属节点后，这里给出各段完成时间
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="segment-breakdown-card">
      <div className="segment-breakdown-head">
        <div>
          <span className="section-label">分段完成预算</span>
          <span className="timeline-caption">
            整页 {formatTime(result.completionMs)} = 各段并行推进后的完成时刻
          </span>
        </div>
      </div>
      <div className="segment-chain-flow" aria-label="整条链路的分段构成">
        {named.map((stat, index) => (
          <span className="segment-chain-step" key={stat.segmentId}>
            <span
              className={`segment-chain-pill ${stat.isBottleneck ? "is-bottleneck" : ""}`}
            >
              {stat.order + 1}. {stat.name}
              <b>{formatTime(stat.completionMs)}</b>
            </span>
            {index < named.length - 1 && <ChevronRight size={13} />}
          </span>
        ))}
        {unassigned.map((stat) => (
          <span
            className="segment-chain-step is-unassigned"
            key={stat.segmentId}
          >
            <span className="segment-chain-pill">
              {stat.name}
              <b>{formatTime(stat.completionMs)}</b>
            </span>
          </span>
        ))}
      </div>
      <div className="segment-stat-grid">
        {result.segments.map((stat) => (
          <article
            key={stat.segmentId}
            className={`segment-stat-card ${stat.isBottleneck ? "is-bottleneck" : ""} ${stat.unassigned ? "is-unassigned" : ""}`}
          >
            <div className="segment-stat-head">
              <span className="segment-stat-order">{stat.order + 1}</span>
              <strong>{stat.name}</strong>
              {stat.isBottleneck && (
                <em className="bottleneck-tag">关键瓶颈</em>
              )}
            </div>
            <b className="segment-stat-time">{formatTime(stat.completionMs)}</b>
            <div className="segment-stat-bar">
              <i
                style={{
                  width: `${maxCritical ? Math.max(4, (stat.criticalMs / maxCritical) * 100) : 0}%`,
                }}
              />
            </div>
            <small>
              {stat.nodeCount} 节点 · 段内等待 {formatTime(stat.waitMs)} ·
              关键链路 {stat.criticalNodeCount} 个 /{" "}
              {formatTime(stat.criticalMs)}
            </small>
          </article>
        ))}
      </div>
      {unassigned.some((stat) => stat.nodeCount > 0) && (
        <div className="segment-unassigned-note">
          <AlertTriangle size={13} /> {unassigned[0]?.nodeCount}{" "}
          个节点没有归属分段，已按“未分段”单独列出；
          在请求编排中补充分段后可纳入首屏/可交互口径。
        </div>
      )}
    </div>
  );
}
