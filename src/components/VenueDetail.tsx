import type { DeadlineKind, Venue } from '../types';
import { getDeadlinesForVenue, isDeadlinePassed } from '../data';

interface VenueDetailProps {
  venue: Venue;
  onCreatePlan: (venue: Venue) => void;
  onClose: () => void;
}

const KIND_LABELS: Record<DeadlineKind, string> = {
  abstract: '摘要',
  paper: '论文投稿',
  supplement: '补充材料',
  rebuttal: '作者反驳',
  camera_ready: '终稿',
  notification: '结果通知',
  other: '其他',
};

function formatDeadline(dueLocal: string): string {
  return dueLocal.replace('T', ' ').slice(0, 16);
}

export function VenueDetail({ venue, onCreatePlan, onClose }: VenueDetailProps) {
  const typeLabel = venue.type === 'conference' ? '会议' : '期刊';
  const verifiedAt = venue.evidence[0]?.last_verified_at ?? '未知';
  const deadlines = getDeadlinesForVenue(venue.id);

  return (
    <section className="section venue-detail" role="dialog" aria-modal="true" aria-label={venue.name}>
      <div className="detail-head">
        <div>
          <h2>{venue.short_name}</h2>
          <p className="venue-fullname">{venue.name}</p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="关闭详情">
          关闭
        </button>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>类型</dt>
          <dd>{typeLabel}</dd>
        </div>
        <div>
          <dt>领域</dt>
          <dd>{venue.field_ids.join(', ')}</dd>
        </div>
        <div>
          <dt>官方网站</dt>
          <dd>
            <a href={venue.official_url} target="_blank" rel="noreferrer">
              {venue.official_url}
            </a>
          </dd>
        </div>
        <div>
          <dt>信息核验日期</dt>
          <dd>{verifiedAt}</dd>
        </div>
      </dl>

      {deadlines.length > 0 ? (
        <div className="deadline-block">
          <h3>重要日期</h3>
          <ul className="deadline-list">
            {deadlines.map((deadline) => {
              const passed = isDeadlinePassed(deadline.due_local);
              const tentative = deadline.status === 'tentative';
              return (
                <li key={deadline.id} className="deadline-row">
                  <span className="deadline-kind">{KIND_LABELS[deadline.kind]}</span>
                  <span className="deadline-date">{formatDeadline(deadline.due_local)}</span>
                  <span className={`deadline-status ${passed ? 'passed' : tentative ? 'tentative' : ''}`}>
                    {passed ? '已截止' : tentative ? '待确认' : '进行中'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="deadline-note">
            时间以官方为准；AoE 表示 Anywhere on Earth（UTC-12）。
          </p>
        </div>
      ) : (
        <p className="notice">暂无已核验的截止日期信息，请以官方网站为准。</p>
      )}

      <button className="primary" onClick={() => onCreatePlan(venue)}>
        为该会议制定投稿计划
      </button>
    </section>
  );
}
