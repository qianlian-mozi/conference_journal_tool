import { useState } from 'react';
import { field, venues } from './data';
import type { SubmissionPlan, Venue } from './types';
import { useSubmissionPlans } from './hooks/useSubmissionPlans';
import { getPlanProgress } from './lib/planner';
import { VenueList } from './components/VenueList';
import { VenueDetail } from './components/VenueDetail';
import { PlanForm } from './components/PlanForm';
import { PlanList } from './components/PlanList';

type View = 'overview' | 'venues' | 'plans';

export default function App() {
  const [view, setView] = useState<View>('overview');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [creatingVenue, setCreatingVenue] = useState<Venue | null>(null);

  const { plans, addPlan, removePlan, toggleMilestone } = useSubmissionPlans();

  const completedCount = plans.reduce(
    (sum, plan) => sum + getPlanProgress(plan).completed,
    0,
  );
  const totalCount = plans.reduce((sum, plan) => sum + getPlanProgress(plan).total, 0);

  function handleCreatePlan(venue: Venue) {
    setCreatingVenue(venue);
    setSelectedVenue(null);
  }

  function handleSubmitPlan(plan: SubmissionPlan) {
    addPlan(plan);
    setCreatingVenue(null);
    setView('plans');
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>CV 投稿辅助工具</h1>
              <p className="subtitle">
                {field.name_zh} · 会议与期刊投稿管理
              </p>
            </div>
          </div>
          <nav className="nav" aria-label="主导航">
            <button
              className={view === 'overview' ? 'nav-active' : ''}
              onClick={() => setView('overview')}
            >
              总览
            </button>
            <button
              className={view === 'venues' ? 'nav-active' : ''}
              onClick={() => {
                setSelectedVenue(null);
                setView('venues');
              }}
            >
              浏览会议
            </button>
            <button
              className={view === 'plans' ? 'nav-active' : ''}
              onClick={() => setView('plans')}
            >
              投稿计划
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {view === 'overview' && (
          <div className="overview">
            <section className="section stats">
              <div className="stat">
                <span className="stat-value">{venues.length}</span>
                <span className="stat-label">收录会议/期刊</span>
              </div>
              <div className="stat">
                <span className="stat-value">{plans.length}</span>
                <span className="stat-label">投稿计划</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {totalCount > 0 ? `${completedCount}/${totalCount}` : '—'}
                </span>
                <span className="stat-label">已完成里程碑</span>
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>近期计划</h2>
                <button className="primary" onClick={() => setView('venues')}>
                  新建投稿计划
                </button>
              </div>
              {plans.length === 0 ? (
                <p className="empty">
                  还没有投稿计划。点击「浏览会议」，选择一个会议开始制定。
                </p>
              ) : (
                <PlanList
                  plans={plans.slice(0, 3)}
                  onToggleMilestone={toggleMilestone}
                  onDelete={removePlan}
                />
              )}
            </section>
          </div>
        )}

        {view === 'venues' && (
          <div className="venues-view">
            {selectedVenue ? (
              <VenueDetail
                venue={selectedVenue}
                onCreatePlan={handleCreatePlan}
                onClose={() => setSelectedVenue(null)}
              />
            ) : creatingVenue ? (
              <PlanForm venue={creatingVenue} onSubmit={handleSubmitPlan} onCancel={() => setCreatingVenue(null)} />
            ) : (
              <>
                <h2 className="page-title">浏览会议</h2>
                <VenueList venues={venues} onSelect={setSelectedVenue} />
              </>
            )}
          </div>
        )}

        {view === 'plans' && (
          <div className="plans-view">
            {creatingVenue ? (
              <PlanForm venue={creatingVenue} onSubmit={handleSubmitPlan} onCancel={() => setCreatingVenue(null)} />
            ) : (
              <>
                <div className="section-head">
                  <h2 className="page-title">投稿计划</h2>
                  <button className="primary" onClick={() => setView('venues')}>
                    新建投稿计划
                  </button>
                </div>
                <PlanList
                  plans={plans}
                  onToggleMilestone={toggleMilestone}
                  onDelete={removePlan}
                />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        信息仅供参考，以官方网站最新公告为准。数据本地保存。
      </footer>
    </div>
  );
}
