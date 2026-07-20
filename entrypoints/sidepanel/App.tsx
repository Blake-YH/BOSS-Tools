import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CircleStop,
  ExternalLink,
  History,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Target,
  Trash2
} from 'lucide-react'
import { CITY_OPTIONS, COMPANY_SCALE_OPTIONS } from '../../src/domain/filter-options'
import type { FilterConfig, ProcessedJob, RunStatus } from '../../src/domain/types'
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog'
import { KeywordEditor } from '../../src/ui/components/KeywordEditor'
import { useExtensionApp } from '../../src/ui/hooks/use-extension-app'

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: '等待开始',
  running: '正在沟通',
  'pause-requested': '等待安全暂停',
  paused: '已暂停',
  blocked: '已阻止',
  stopped: '已停止'
}

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))

export const App = (): React.JSX.Element => {
  const app = useExtensionApp()
  const saveConfig = app.saveConfig
  const [draft, setDraft] = useState<FilterConfig | null>(null)
  const [view, setView] = useState<'workspace' | 'history'>('workspace')
  const [confirmClear, setConfirmClear] = useState(false)
  const [pendingDeleteJob, setPendingDeleteJob] = useState<ProcessedJob | null>(null)
  const hydrated = useRef(false)

  useEffect(() => {
    if (app.snapshot && !hydrated.current) {
      hydrated.current = true
      setDraft(app.snapshot.filterConfig)
    }
  }, [app.snapshot])

  useEffect(() => {
    if (!draft || !hydrated.current) return
    const timer = window.setTimeout(() => void saveConfig(draft), 500)
    return () => window.clearTimeout(timer)
  }, [draft, saveConfig])

  if (!app.snapshot || !draft) {
    return <main className="loading"><BriefcaseBusiness size={24} /> 正在加载工作台</main>
  }

  const snapshot = app.snapshot
  const isRunning = ['running', 'pause-requested'].includes(snapshot.run.status)
  const isPaused = snapshot.run.status === 'paused'
  const isLocked = isRunning || isPaused
  const pageReady = snapshot.page.phase === 'ready'
  const busy = app.busyAction !== null
  const updateDraft = (patch: Partial<FilterConfig>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current))

  const primaryAction = (): void => {
    if (isRunning) void app.sendCommand('pause', { type: 'PAUSE' })
    else if (isPaused) void app.sendCommand('resume', { type: 'RESUME' })
    else void app.startRun(draft)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><BriefcaseBusiness size={18} aria-hidden="true" /></span>
          <div><strong>BOSS Tools</strong><span>本地沟通工作台</span></div>
        </div>
        <div className={`page-state ${snapshot.page.phase}`} title={snapshot.page.message}>
          <span /> {snapshot.page.phase === 'ready' ? '页面已连接' : '页面未就绪'}
        </div>
      </header>

      <div className="top-actions">
        <div className="segmented" role="tablist" aria-label="工作台视图">
          <button className={view === 'workspace' ? 'active' : ''} type="button" onClick={() => setView('workspace')}>
            <Settings2 size={15} /> 工作台
          </button>
          <button className={view === 'history' ? 'active' : ''} type="button" onClick={() => setView('history')}>
            <History size={15} /> 历史 <span>{snapshot.historyCount}</span>
          </button>
        </div>
        <button className="icon-button dark" type="button" title="刷新页面连接" onClick={() => void app.refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {snapshot.page.phase !== 'ready' ? (
        <section className="connection-strip">
          <div><AlertTriangle size={16} /><span>{snapshot.page.message}</span></div>
          <button className="button secondary" type="button" onClick={() => void app.openBoss()}>
            <ExternalLink size={15} /> 打开 BOSS
          </button>
        </section>
      ) : null}
      {app.error ? <div className="error-strip" role="alert"><AlertTriangle size={16} />{app.error}</div> : null}

      {view === 'workspace' ? (
        <>
          <section className="metric-grid" aria-label="运行统计">
            <div className="metric primary"><CheckCircle2 size={19} /><span>本次已沟通<strong>{snapshot.run.sessionContactedCount}</strong><small>/ {draft.contactLimit}</small></span></div>
            <div className="metric"><Search size={17} /><span>已扫描<strong>{snapshot.run.scannedCount}</strong></span></div>
            <div className="metric"><Target size={17} /><span>已匹配<strong>{snapshot.run.matchedCount}</strong></span></div>
            <div className="metric"><History size={17} /><span>历史成功<strong>{snapshot.contactedHistoryCount}</strong></span></div>
          </section>

          <section className={`run-strip ${snapshot.run.status}`}>
            <div className="run-copy">
              <span>{STATUS_LABELS[snapshot.run.status]}</span>
              <strong>{snapshot.run.currentJobTitle ?? snapshot.run.lastMessage}</strong>
              {snapshot.run.currentJobTitle ? <small>{snapshot.run.lastMessage}</small> : null}
            </div>
            <div className="run-actions">
              <button className="button primary" disabled={busy || (!pageReady && !isRunning)} type="button" onClick={primaryAction}>
                {isRunning ? <Pause size={17} /> : isPaused ? <RotateCcw size={17} /> : <Play size={17} />}
                {isRunning ? '暂停' : isPaused ? '继续' : '开始'}
              </button>
              <button
                className="icon-button stop"
                disabled={busy || (!isRunning && !isPaused)}
                type="button"
                title="停止本次运行"
                onClick={() => void app.sendCommand('stop', { type: 'STOP' })}
              ><CircleStop size={18} /></button>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><span>01</span><h2>平台筛选</h2></div><small>自动保存</small></div>
            <div className="form-grid">
              <label><span>所在城市</span>
                <select disabled={isLocked} value={draft.cityCode} onChange={(event) => {
                  const city = CITY_OPTIONS.find((item) => item.code === event.target.value)
                  if (city) updateDraft({ cityCode: city.code, cityLabel: city.label })
                }}>
                  {CITY_OPTIONS.map((city) => <option key={city.code} value={city.code}>{city.label}</option>)}
                </select>
              </label>
              <label><span>预沟通数量</span>
                <input disabled={isLocked} inputMode="numeric" max={200} min={1} step={1} type="number" value={draft.contactLimit} onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value >= 1 && value <= 200) updateDraft({ contactLimit: value })
                }} />
              </label>
            </div>
            <fieldset>
              <legend>公司规模</legend>
              <div className="scale-grid">
                {COMPANY_SCALE_OPTIONS.map((scale) => {
                  const checked = draft.companyScales.includes(scale.code)
                  return <label className={checked ? 'checked' : ''} key={scale.code}>
                    <input checked={checked} disabled={isLocked} type="checkbox" onChange={() => updateDraft({
                      companyScales: checked ? draft.companyScales.filter((code) => code !== scale.code) : [...draft.companyScales, scale.code]
                    })} />
                    <span>{scale.label}</span>
                  </label>
                })}
              </div>
            </fieldset>
          </section>

          <section className="section-block keywords-block">
            <div className="section-heading"><div><span>02</span><h2>自定义筛选词</h2></div></div>
            <KeywordEditor label="包含词" description="职位名称、技能和描述" tone="include" keywords={draft.includeKeywords} locked={isLocked} onChange={(includeKeywords) => updateDraft({ includeKeywords })} />
            <KeywordEditor label="排除词" description="额外检查公司名称，优先生效" tone="exclude" keywords={draft.excludeKeywords} locked={isLocked} onChange={(excludeKeywords) => updateDraft({ excludeKeywords })} />
          </section>

          <footer className="safety-note"><AlertTriangle size={15} /><span>遇到验证、额度或未知页面状态时自动停止。</span></footer>
        </>
      ) : (
        <section className="history-view">
          <div className="history-heading"><div><h2>岗位处理历史</h2><p>成功记录用于永久去重</p></div>
            <button className="button danger-outline" disabled={busy || snapshot.historyCount === 0 || isLocked} type="button" onClick={() => setConfirmClear(true)}><Trash2 size={15} />清除</button>
          </div>
          <div className="history-list">
            {snapshot.history.length === 0 ? <div className="empty-history"><History size={22} /><span>暂无处理记录</span></div> : snapshot.history.map((job) => (
              <article className="history-item" key={job.jobId}>
                <div className="history-main">
                  <div><strong>{job.title || '未命名岗位'}</strong><span>{job.company || '未知公司'}</span></div>
                  <button
                    className="icon-button history-delete"
                    disabled={busy || isLocked}
                    type="button"
                    title={`删除“${job.title || '未命名岗位'}”的历史记录`}
                    onClick={() => setPendingDeleteJob(job)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span className="sr-only">删除此条历史记录</span>
                  </button>
                </div>
                <div className="history-meta"><span>{job.matchedKeyword ?? job.reason}</span><time>{formatTime(job.processedAt)}</time><b className={job.outcome}>{job.outcome === 'contacted' ? '已沟通' : job.outcome === 'skipped' ? '已跳过' : job.outcome === 'failed' ? '失败' : '已阻止'}</b></div>
              </article>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        confirmLabel="确认清除"
        description="清除后，以前成功沟通过的岗位可能被再次处理。"
        open={confirmClear}
        title="清除全部历史？"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); void app.clearHistory() }}
      />
      <ConfirmDialog
        confirmLabel="删除此条"
        description={`删除“${pendingDeleteJob?.title || '该岗位'}”后，该岗位未来可能被再次沟通。`}
        open={pendingDeleteJob !== null}
        title="删除这条历史？"
        onCancel={() => setPendingDeleteJob(null)}
        onConfirm={() => {
          const jobId = pendingDeleteJob?.jobId
          setPendingDeleteJob(null)
          if (jobId) void app.deleteHistoryJob(jobId)
        }}
      />
    </main>
  )
}
