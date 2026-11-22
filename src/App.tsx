import { useMemo, useState } from 'react';
import {
  allVenues,
  daysLeft,
  defaultPack,
  formatDateTime,
  kindLabel,
  latestEdition,
  packs,
  recentChanges,
  resolvePackId,
  shelfState,
  sortKey,
  submitDeadline,
} from './data';
import type { ShelfChange, ShelfChangeValue, ShelfVenue, VenueType } from './types';
import { buildDeadlineCalendar } from './lib/deadline-ics';

type TypeFilter = 'all' | VenueType;

function stateLabel(venue: ShelfVenue, now: number): { tone: string; text: string } {
  if (venue.submission_model === 'rolling') {
    return { tone: 'open', text: '随时投稿' };
  }
  const state = shelfState(venue, now);
  const deadline = submitDeadline(venue);
  const days = deadline ? daysLeft(deadline, now) : null;

  if (state === 'unknown') return { tone: 'unknown', text: '下一届未公布' };
  if (days === null) return { tone: 'unknown', text: '日期待确认' };
  if (days < 0) return { tone: 'passed', text: `已截止 · ${Math.abs(days)} 天前` };
  if (days === 0) return { tone: 'soon', text: '今天截止' };
  if (days <= 14) return { tone: 'soon', text: `还有 ${days} 天` };
  return { tone: 'open', text: `还有 ${days} 天` };
}

function qualificationLabel(venue: ShelfVenue): string | null {
  const ccf = venue.qualifications.find((item) => item.system === 'ccf');
  if (ccf) return `CCF ${ccf.level}`;
  const core = venue.qualifications.find((item) => item.system === 'core');
  if (core) return `CORE ${core.level}`;
  return null;
}

function VenueCard({
  venue,
  now,
  onOpen,
}: {
  venue: ShelfVenue;
  now: number;
  onOpen: (venue: ShelfVenue) => void;
}) {
  const state = stateLabel(venue, now);
  const deadline = submitDeadline(venue);
  const edition = latestEdition(venue);
  const badge = qualificationLabel(venue);

  return (
    <button className={`card card-${state.tone}`} onClick={() => onOpen(venue)}>
      <div className="card-top">
        <span className={`tag tag-${venue.type}`}>{venue.type === 'conference' ? '会议' : '期刊'}</span>
        {badge && <span className="tag tag-rank">{badge}</span>}
      </div>

      <h3 className="card-title">{venue.short}</h3>
      <p className="card-fullname">{venue.full}</p>

      <div className="card-status">
        <span className="status-number">{state.text}</span>
        {deadline && (
          <span className="status-detail">
            {kindLabel(deadline.kind)} · {formatDateTime(deadline)}
          </span>
        )}
        {!deadline && venue.submission_model === 'rolling' && (
          <span className="status-detail">滚动审稿，无固定截止日期</span>
        )}
      </div>

      <div className="card-foot">
        {edition?.location && <span>{edition.location}</span>}
        {edition && <span>{edition.year}</span>}
        {deadline && <span>核验于 {deadline.evidence.fetched_at}</span>}
      </div>
    </button>
  );
}

function DetailPanel({ venue, now, onClose }: { venue: ShelfVenue; now: number; onClose: () => void }) {
  const edition = latestEdition(venue);
  const deadlines = edition
    ? [...edition.deadlines].sort((a, b) => a.due.localeCompare(b.due))
    : [];

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="panel" onClick={(event) => event.stopPropagation()}>
        <header className="panel-head">
          <div>
            <h2>{venue.short}</h2>
            <p className="panel-fullname">{venue.full}</p>
          </div>
          <button className="close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <dl className="meta">
          <div>
            <dt>类型</dt>
            <dd>{venue.type === 'conference' ? '会议' : '期刊'}</dd>
          </div>
          <div>
            <dt>投稿方式</dt>
            <dd>{venue.submission_model === 'rolling' ? '滚动投稿' : '固定截止日期'}</dd>
          </div>
          <div>
            <dt>出版方</dt>
            <dd>{venue.publisher ?? '—'}</dd>
          </div>
          <div>
            <dt>官网</dt>
            <dd>
              <a href={venue.official_url} target="_blank" rel="noreferrer">
                打开
              </a>
            </dd>
          </div>
          {edition?.location && (
            <div>
              <dt>地点</dt>
              <dd>{edition.location}</dd>
            </div>
          )}
          {edition?.dates && (
            <div>
              <dt>会期</dt>
              <dd>
                {edition.dates.start} → {edition.dates.end}
              </dd>
            </div>
          )}
        </dl>

        <h3 className="section-title">重要日期</h3>
        {deadlines.length === 0 ? (
          <p className="empty">下一届日期尚未公布。我们不会用猜测的日期填充。</p>
        ) : (
          <ul className="deadline-list">
            {deadlines.map((deadline) => {
              const days = daysLeft(deadline, now);
              const passed = days !== null && days < 0;
              return (
                <li key={deadline.id} className="deadline-row">
                  <div className="deadline-main">
                    <span className="deadline-kind">{deadline.label ?? kindLabel(deadline.kind)}</span>
                    <span className="deadline-when">{formatDateTime(deadline)}</span>
                  </div>
                  <div className="deadline-side">
                    <span className={passed ? 'pill pill-passed' : 'pill pill-open'}>
                      {days === null ? '待确认' : passed ? `已过 ${Math.abs(days)} 天` : `还有 ${days} 天`}
                    </span>
                    <a
                      className="evidence"
                      href={deadline.evidence.url}
                      target="_blank"
                      rel="noreferrer"
                      title={deadline.evidence.quote ?? ''}
                    >
                      来源
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="disclaimer">
          日期以官网为准；带「来源」的条目可回溯源页面原文与抓取时间。
        </p>
      </div>
    </div>
  );
}

function formatChangeValue(value: ShelfChangeValue): string {
  return `${value.due.replace('T', ' ').slice(0, 16)} ${value.timezone}`;
}

function WeeklyChanges({ packId, now }: { packId: string; now: number }) {
  const entries = recentChanges(packId, now);
  const venueNames = new Map(allVenues.map((venue) => [venue.id, venue.short]));

  return (
    <section className="changes" aria-labelledby="recent-changes-title">
      <div className="changes-head">
        <h2 id="recent-changes-title">近 7 天变更</h2>
        <span>{entries.length} 条真实 diff</span>
      </div>
      {entries.length === 0 ? (
        <p className="changes-empty">暂无已记录变更；dry-run 和重复抓取不会制造历史。</p>
      ) : (
        <ul className="changes-list">
          {entries.slice(0, 6).map((entry: ShelfChange) => {
            const subject = entry.after ?? entry.before;
            const action = entry.change === 'added' ? '新增' : entry.change === 'removed' ? '移除' : '调整';
            return (
              <li key={entry.id}>
                <span className={`change-badge change-${entry.change}`}>{action}</span>
                <div className="change-main">
                  <strong>{venueNames.get(entry.venue_id) ?? entry.venue_id}</strong>
                  <span>{entry.label ?? kindLabel(entry.deadline_kind)}</span>
                  <span className="change-value">
                    {entry.change === 'changed' && entry.before && entry.after
                      ? `${formatChangeValue(entry.before)} → ${formatChangeValue(entry.after)}`
                      : subject
                        ? formatChangeValue(subject)
                        : ''}
                  </span>
                </div>
                <div className="change-meta">
                  <span>{entry.detected_at}</span>
                  <a href={entry.evidence.url} target="_blank" rel="noreferrer" title={entry.evidence.quote ?? ''}>
                    证据
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function App() {
  const [packId, setPackId] = useState(() =>
    resolvePackId(new URLSearchParams(window.location.search).get('pack')),
  );
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [selected, setSelected] = useState<ShelfVenue | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');

  const now = Date.now();
  const pack = packs.find((item) => item.id === packId) ?? defaultPack;
  const packVenueIds = new Set(pack.venue_ids);
  const packVenues = allVenues.filter((venue) => packVenueIds.has(venue.id));

  function changePack(nextId: string): void {
    setPackId(nextId);
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.set('pack', nextId);
    window.history.replaceState(null, '', url);
  }

  const list = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return packVenues
      .filter((venue) => typeFilter === 'all' || venue.type === typeFilter)
      .filter((venue) => {
        if (keyword === '') return true;
        return (
          venue.short.toLowerCase().includes(keyword) ||
          venue.full.toLowerCase().includes(keyword) ||
          venue.id.includes(keyword)
        );
      })
      .filter((venue) => {
        if (!openOnly) return true;
        const state = shelfState(venue, now);
        return state === 'open' || state === 'soon';
      })
      .sort((a, b) => sortKey(a, now) - sortKey(b, now));
  }, [query, typeFilter, openOnly, now, packId]);

  const openCount = packVenues.filter((venue) => {
    const state = shelfState(venue, now);
    return state === 'open' || state === 'soon';
  }).length;

  function exportCalendar(): void {
    const result = buildDeadlineCalendar(list, {
      name: `${pack.name_zh} · CV Venue Radar`,
      description: `${pack.name_en} 投稿截止日期；每条事件附官网来源，按 UTC 存储并由日历转换为本地时间。`,
    });
    if (result.eventCount === 0) {
      setCalendarMessage('当前列表没有可导出的精确截止日期。');
      return;
    }
    const blob = new Blob([result.ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cv-venue-radar-${pack.id}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setCalendarMessage(
      `已导出 ${result.eventCount} 个节点${result.skippedCount > 0 ? `；${result.skippedCount} 条待确认日期未导出` : ''}。`,
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <p className="eyebrow">CV Venue Radar · {pack.tier} pack</p>
          <h1>{pack.name_zh}</h1>
          {pack.tagline_zh && <p className="hero-tagline">{pack.tagline_zh}</p>}
          <p className="hero-sub">
            收录 {packVenues.length} 个会议与期刊，其中 <strong>{openCount}</strong> 个当前可投。
            每条日期都带官网原文，可逐条回溯。
          </p>
        </div>
      </header>

      <div className="toolbar">
        <label className="pack-picker">
          <span>领域包</span>
          <select value={pack.id} onChange={(event) => changePack(event.target.value)}>
            {packs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_zh} · {item.name_en}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          placeholder="搜索会议、期刊…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索"
        />
        <div className="segmented" role="group" aria-label="类型筛选">
          {(
            [
              ['all', '全部'],
              ['conference', '会议'],
              ['journal', '期刊'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={typeFilter === value ? 'active' : ''}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          只看还能投
        </label>
        <button
          type="button"
          className="calendar-export"
          onClick={exportCalendar}
          title="把当前领域包与筛选结果中的精确截止日期导出为 ICS"
        >
          导出日历
        </button>
        <span className="calendar-status" role="status">{calendarMessage}</span>
      </div>

      <WeeklyChanges packId={pack.id} now={now} />

      <main>
        {list.length === 0 ? (
          <p className="empty">没有匹配的会议或期刊。</p>
        ) : (
          <div className="grid">
            {list.map((venue) => (
              <VenueCard key={venue.id} venue={venue} now={now} onOpen={setSelected} />
            ))}
          </div>
        )}
      </main>

      <footer className="foot">
        数据来自各会议/期刊官网，每条日期保留来源与核验时间。信息仅供参考，以官方公告为准。
      </footer>

      {selected && <DetailPanel venue={selected} now={now} onClose={() => setSelected(null)} />}
    </div>
  );
}
