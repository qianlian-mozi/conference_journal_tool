import { useMemo, useState } from 'react';
import type { Venue, VenueType } from '../types';

interface VenueListProps {
  venues: Venue[];
  onSelect: (venue: Venue) => void;
}

export function VenueList({ venues, onSelect }: VenueListProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<VenueType | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((venue) => {
      const matchesType = typeFilter === 'all' || venue.type === typeFilter;
      const matchesQuery =
        q === '' ||
        venue.name.toLowerCase().includes(q) ||
        venue.short_name.toLowerCase().includes(q) ||
        venue.id.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [venues, query, typeFilter]);

  const typeLabel = (type: VenueType) => (type === 'conference' ? '会议' : '期刊');

  return (
    <section className="section">
      <div className="toolbar">
        <input
          type="search"
          placeholder="搜索名称、简称…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索会议或期刊"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as VenueType | 'all')}
          aria-label="按类型筛选"
        >
          <option value="all">全部类型</option>
          <option value="conference">会议</option>
          <option value="journal">期刊</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">没有匹配的会议或期刊。</p>
      ) : (
        <ul className="venue-list">
          {filtered.map((venue) => (
            <li key={venue.id}>
              <button className="venue-card" onClick={() => onSelect(venue)}>
                <div className="venue-card-head">
                  <span className="venue-name">{venue.short_name}</span>
                  <span className="badge">{typeLabel(venue.type)}</span>
                </div>
                <p className="venue-fullname">{venue.name}</p>
                <span className="venue-link">{venue.official_url}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
