import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ── Types matching public/all_results.json (written by run_all.py) ────────────
interface GanttEntry {
  pid: string;
  start: number;
  end: number;
}

interface ProcessStat {
  pid: string;
  arrival: number;
  priority: number;
  cpuBurst: number;
  ioBurst: number;
  waitingTime: number;
  turnaroundTime: number;
  responseTime: number;
  finish: number;
}

interface Summary {
  [metric: string]: string;
}

interface AlgoResult {
  algorithm: string;
  label: string;
  timestamp: number;
  ganttChart: GanttEntry[];
  processStats: ProcessStat[];
  summary: Summary;
}

interface AllResults {
  timestamp: number;
  algorithms: Record<string, AlgoResult>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ALGO_KEYS = ['FCFS', 'RR', 'Priority', 'SRFJ'] as const;

const ALGO_LABELS: Record<string, string> = {
  FCFS:     'First Come First Serve',
  RR:       'Round Robin',
  Priority: 'Priority (Preemptive)',
  SRFJ:     'Shortest Remaining First Job',
};

const ALGO_SHORT: Record<string, string> = {
  FCFS: 'FCFS', RR: 'RR', Priority: 'Priority', SRFJ: 'SRFJ',
};

const ALGO_COLORS: Record<string, string> = {
  FCFS: '#3B82F6', RR: '#F59E0B', Priority: '#8B5CF6', SRFJ: '#10B981',
};

const PROCESS_COLORS = [
  '#3B82F6', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#06B6D4', '#EC4899', '#F97316',
  '#84CC16', '#14B8A6',
];

const SUMMARY_METRICS = [
  { key: 'Average Waiting Time',    label: 'Avg Waiting',    color: 'from-blue-500 to-blue-600' },
  { key: 'Average Turnaround Time', label: 'Avg Turnaround', color: 'from-cyan-500 to-cyan-600' },
  { key: 'Average Response Time',   label: 'Avg Response',   color: 'from-sky-500 to-sky-600' },
  { key: 'CPU Utilization',         label: 'CPU Util %',     color: 'from-blue-600 to-blue-700' },
  { key: 'Throughput',              label: 'Throughput',     color: 'from-indigo-500 to-indigo-600' },
  { key: 'Context Switches',        label: 'Context Sw.',    color: 'from-violet-500 to-violet-600' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function colorizeGantt(gantt: GanttEntry[]) {
  const pidIndex: Record<string, number> = {};
  return gantt.map(b => {
    if (!(b.pid in pidIndex)) pidIndex[b.pid] = Object.keys(pidIndex).length;
    return {
      ...b,
      color: b.pid === 'IDLE' ? '#94A3B8'
           : PROCESS_COLORS[pidIndex[b.pid] % PROCESS_COLORS.length],
    };
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function GanttChart({ gantt, dm }: { gantt: GanttEntry[]; dm: boolean }) {
  if (!gantt.length)
    return <p className={`text-sm text-center py-4 ${dm ? 'text-slate-400' : 'text-blue-400'}`}>No Gantt data</p>;

  const colored = colorizeGantt(gantt);
  const maxTime = colored[colored.length - 1].end;

  return (
    <div className="space-y-1">
      <div className={`relative h-14 rounded-lg overflow-hidden border ${dm ? 'bg-black border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
        <div className="absolute inset-0 flex">
          {colored.map((b, i) => (
            <div
              key={i}
              title={`${b.pid}: ${b.start}–${b.end} (${b.end - b.start} units)`}
              className="relative flex items-center justify-center border-r border-white/20 group"
              style={{ width: `${((b.end - b.start) / maxTime) * 100}%`, minWidth: 2, backgroundColor: b.color }}
            >
              {((b.end - b.start) / maxTime) > 0.04 && (
                <span className="text-white text-xs font-semibold drop-shadow select-none">{b.pid}</span>
              )}
              <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20
                opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity
                text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg
                ${dm ? 'bg-slate-800 text-blue-100 border border-slate-600'
                     : 'bg-white text-blue-900 border border-blue-200'}`}>
                {b.pid}: {b.start}→{b.end} ({b.end - b.start})
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={`relative flex text-xs ${dm ? 'text-blue-300' : 'text-blue-600'}`} style={{ height: 16 }}>
        {colored.map((b, i) => (
          <div key={i} style={{ width: `${((b.end - b.start) / maxTime) * 100}%`, position: 'relative' }}>
            {i === 0 && <span className="absolute left-0 font-bold">{b.start}</span>}
            <span className="absolute right-0 font-bold">{b.end}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessTable({ stats, dm }: { stats: ProcessStat[]; dm: boolean }) {
  if (!stats.length)
    return <p className={`text-sm text-center py-4 ${dm ? 'text-slate-400' : 'text-blue-400'}`}>No data</p>;

  const hasPriority = stats.some(s => s.priority !== 0);
  const hasIO       = stats.some(s => s.ioBurst > 0);

  type Col = { key: keyof ProcessStat | 'cpuBurst' | 'ioBurst'; label: string };
  const cols: Col[] = [
    { key: 'pid',           label: 'PID' },
    { key: 'arrival',       label: 'Arrival' },
    ...(hasPriority ? [{ key: 'priority' as const, label: 'Priority' }] : []),
    { key: 'cpuBurst',      label: 'CPU Burst' },
    ...(hasIO       ? [{ key: 'ioBurst'  as const, label: 'I/O Burst' }] : []),
    { key: 'waitingTime',   label: 'Waiting' },
    { key: 'turnaroundTime',label: 'Turnaround' },
    { key: 'responseTime',  label: 'Response' },
    { key: 'finish',        label: 'Finish' },
  ];

  const headerCls = dm ? 'bg-blue-900/40 text-blue-100' : 'bg-blue-600 text-white';
  const rowEven   = dm ? 'bg-black text-blue-200'        : 'bg-blue-50 text-blue-700';
  const rowOdd    = dm ? 'bg-slate-950 text-blue-200'    : 'bg-white text-blue-700';
  const divLine   = dm ? 'border-slate-800'              : 'border-blue-100';

  return (
    <div className={`rounded-lg overflow-hidden border text-sm ${dm ? 'border-slate-700' : 'border-blue-200'}`}>
      <div className={`grid ${headerCls}`}
           style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map(c => (
          <div key={c.key} className="px-2 py-2 font-semibold text-center">{c.label}</div>
        ))}
      </div>
      {stats.map((s, idx) => (
        <div key={s.pid}
             className={`grid border-t ${divLine} ${idx % 2 === 0 ? rowEven : rowOdd}`}
             style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
          <div className={`px-2 py-2 font-semibold text-center ${dm ? 'text-blue-100' : 'text-blue-900'}`}>{s.pid}</div>
          <div className="px-2 py-2 text-center">{s.arrival}</div>
          {hasPriority && <div className="px-2 py-2 text-center">{s.priority}</div>}
          <div className="px-2 py-2 text-center">{s.cpuBurst}</div>
          {hasIO       && <div className="px-2 py-2 text-center">{s.ioBurst || '—'}</div>}
          <div className="px-2 py-2 text-center">{s.waitingTime}</div>
          <div className="px-2 py-2 text-center">{s.turnaroundTime}</div>
          <div className="px-2 py-2 text-center">{s.responseTime}</div>
          <div className="px-2 py-2 text-center">{s.finish}</div>
        </div>
      ))}
    </div>
  );
}

function MetricCards({ summary, dm }: { summary: Summary; dm: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SUMMARY_METRICS.map(m => (
        <div key={m.key} className={`bg-gradient-to-br ${m.color} rounded-xl p-4 text-white`}>
          <div className="text-xs opacity-75 mb-1">{m.label}</div>
          <div className="text-2xl font-semibold">
            {summary[m.key] ?? '—'}
            {m.key === 'CPU Utilization' && summary[m.key] ? '%' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [allResults, setAllResults] = useState<AllResults | null>(null);
  const [activeTab, setActiveTab]   = useState<string>('overview');
  const [darkMode, setDarkMode]     = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [loading, setLoading]       = useState(true);

  // Poll public/all_results.json — produced by run_all.py
  useEffect(() => {
    let lastTs = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/all_results.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data: AllResults = await res.json();
        if (data.timestamp !== lastTs) {
          lastTs = data.timestamp;
          setAllResults(data);
          setLastUpdate(new Date(data.timestamp * 1000).toLocaleTimeString());
          setLoading(false);
        }
      } catch { /* file not ready yet */ }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => clearInterval(id);
  }, []);

  // ── Theme helpers
  const dm   = darkMode;
  const bg   = dm ? 'bg-gradient-to-br from-black via-slate-950 to-black'
                  : 'bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50';
  const card = dm ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200';
  const text = dm ? 'text-blue-50'  : 'text-blue-900';
  const sub  = dm ? 'text-blue-300' : 'text-blue-600';
  const ttStyle = {
    backgroundColor: dm ? '#0F172A' : '#EFF6FF',
    border: `1px solid ${dm ? '#1E293B' : '#BFDBFE'}`,
    borderRadius: 8,
    color: dm ? '#DBEAFE' : '#1E40AF',
  };
  const axisColor = dm ? '#60A5FA' : '#1E40AF';
  const gridColor = dm ? '#1E293B' : '#BFDBFE';
  const legendStyle = { color: dm ? '#DBEAFE' : '#1E40AF' };

  // ── Overview data (all 5 key metrics compared across algorithms)
  const metricComparison = SUMMARY_METRICS.slice(0, 5).map(m => {
    const row: Record<string, string | number> = { metric: m.label };
    ALGO_KEYS.forEach(a => {
      const r = allResults?.algorithms[a];
      row[a] = r ? parseFloat(r.summary[m.key] ?? '0') : 0;
    });
    return row;
  });

  // ── All unique PIDs (for cross-algorithm process comparison)
  const allPids = Array.from(new Set(
    ALGO_KEYS.flatMap(a => allResults?.algorithms[a]?.processStats.map(s => s.pid) ?? [])
  )).sort();

  const processWaitComparison = allPids.map(pid => {
    const row: Record<string, string | number> = { pid };
    ALGO_KEYS.forEach(a => {
      const s = allResults?.algorithms[a]?.processStats.find(p => p.pid === pid);
      row[`${a}_wait`] = s?.waitingTime ?? 0;
    });
    return row;
  });

  const processFullComparison = allPids.map(pid => {
    const row: Record<string, string | number | null> = { pid };
    ALGO_KEYS.forEach(a => {
      const s = allResults?.algorithms[a]?.processStats.find(p => p.pid === pid);
      row[`${a}_wait`] = s?.waitingTime   ?? null;
      row[`${a}_turn`] = s?.turnaroundTime ?? null;
      row[`${a}_resp`] = s?.responseTime  ?? null;
    });
    return row;
  });

  const tabs = [
    { key: 'overview', label: 'Overview / Compare' },
    ...ALGO_KEYS.map(k => ({ key: k, label: ALGO_SHORT[k] })),
  ];

  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 ${bg}`}>
      <div className="max-w-[1600px] mx-auto space-y-4">

        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${text}`}>CPU Scheduling Simulator</h1>
            <p className={`mt-1 text-sm ${sub}`}>
              Results from <code className="font-mono">algorithms/*.xlsx</code> via{' '}
              <code className="font-mono">python run_all.py</code>
              {lastUpdate && <> · Updated <strong>{lastUpdate}</strong></>}
            </p>
          </div>
          <button
            onClick={() => setDarkMode(!dm)}
            className={`mt-1 px-4 py-2 rounded-lg text-sm shadow-md transition-colors ${
              dm ? 'bg-slate-800 text-blue-100 border border-blue-800 hover:bg-slate-700'
                 : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {dm ? '☀ Light' : '🌙 Dark'}
          </button>
        </header>

        {/* Loading */}
        {loading && (
          <div className={`rounded-xl p-10 text-center border ${card}`}>
            <p className={`text-lg font-medium mb-2 ${text}`}>Waiting for algorithm results…</p>
            <p className={`text-sm ${sub}`}>Open a terminal in the project root and run:</p>
            <code className={`block mt-2 font-mono ${dm ? 'text-green-400' : 'text-green-700'}`}>
              python run_all.py
            </code>
            <p className={`mt-3 text-xs ${sub}`}>
              Compiles all 4 C algorithms, processes each algorithm's
              individual workload file, and writes Excel + JSON files the UI reads.
            </p>
          </div>
        )}

        {!loading && allResults && (
          <>
            {/* Tab bar */}
            <div className={`flex gap-1 p-1 rounded-xl border ${card}`}>
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-blue-600 text-white shadow'
                      : dm ? 'text-blue-300 hover:bg-slate-800' : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">

                {/* Algorithm summary cards */}
                <div className="grid grid-cols-4 gap-4">
                  {ALGO_KEYS.map(a => {
                    const r = allResults.algorithms[a];
                    return (
                      <div key={a} className={`rounded-xl p-4 border ${card}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ALGO_COLORS[a] }} />
                          <span className={`font-semibold text-sm ${text}`}>{ALGO_LABELS[a]}</span>
                        </div>
                        {r ? (
                          <div className="space-y-1.5 text-xs">
                            {SUMMARY_METRICS.slice(0, 4).map(m => (
                              <div key={m.key} className="flex justify-between">
                                <span className={sub}>{m.label}</span>
                                <span className={`font-medium ${text}`}>
                                  {r.summary[m.key] ?? '—'}
                                  {m.key === 'CPU Utilization' && r.summary[m.key] ? '%' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={`text-xs ${sub}`}>No data — run python run_all.py</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Metric comparison */}
                <div className={`rounded-xl p-5 border ${card}`}>
                  <h3 className={`font-semibold mb-4 ${text}`}>Algorithm Metric Comparison</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metricComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="metric" stroke={axisColor} tick={{ fontSize: 11 }} />
                      <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={ttStyle} />
                      <Legend wrapperStyle={legendStyle} />
                      {ALGO_KEYS.map(a => (
                        <Bar key={a} dataKey={a} name={ALGO_SHORT[a]}
                             fill={ALGO_COLORS[a]} radius={[4,4,0,0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Per-process waiting time */}
                <div className={`rounded-xl p-5 border ${card}`}>
                  <h3 className={`font-semibold mb-4 ${text}`}>Per-Process Waiting Time — All Algorithms</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={processWaitComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="pid" stroke={axisColor} />
                      <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={ttStyle} />
                      <Legend wrapperStyle={legendStyle} />
                      {ALGO_KEYS.map(a => (
                        <Bar key={a} dataKey={`${a}_wait`} name={`${ALGO_SHORT[a]} Wait`}
                             fill={ALGO_COLORS[a]} radius={[4,4,0,0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Full per-process comparison table */}
                <div className={`rounded-xl p-5 border ${card}`}>
                  <h3 className={`font-semibold mb-4 ${text}`}>Full Per-Process Statistics — All Algorithms</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className={`p-2 border text-left ${dm ? 'bg-slate-800 border-slate-700 text-blue-100' : 'bg-blue-600 border-blue-500 text-white'}`}>
                            PID
                          </th>
                          {ALGO_KEYS.map(a => (
                            <th key={a} colSpan={3}
                                className={`p-2 border text-center ${dm ? 'bg-slate-800 border-slate-700 text-blue-100' : 'bg-blue-600 border-blue-500 text-white'}`}
                                style={{ borderLeftColor: ALGO_COLORS[a], borderLeftWidth: 3 }}>
                              {ALGO_SHORT[a]}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th className={`p-2 border ${dm ? 'bg-slate-900 border-slate-700 text-blue-200' : 'bg-blue-500 border-blue-400 text-white'}`} />
                          {ALGO_KEYS.flatMap(a =>
                            ['Wait', 'TAT', 'Resp'].map(h => (
                              <th key={`${a}-${h}`}
                                  className={`p-2 border text-center ${dm ? 'bg-slate-900 border-slate-700 text-blue-200' : 'bg-blue-500 border-blue-400 text-white'}`}>
                                {h}
                              </th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {processFullComparison.map((row, idx) => (
                          <tr key={String(row.pid)}
                              className={dm ? (idx%2===0?'bg-black':'bg-slate-950') : (idx%2===0?'bg-blue-50':'bg-white')}>
                            <td className={`p-2 border font-semibold ${dm ? 'border-slate-800 text-blue-100' : 'border-blue-100 text-blue-900'}`}>
                              {row.pid}
                            </td>
                            {ALGO_KEYS.flatMap(a =>
                              (['_wait','_turn','_resp'] as const).map(s => (
                                <td key={`${a}${s}`}
                                    className={`p-2 border text-center ${dm ? 'border-slate-800 text-blue-300' : 'border-blue-100 text-blue-700'}`}>
                                  {row[`${a}${s}`] ?? '—'}
                                </td>
                              ))
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ── INDIVIDUAL ALGORITHM TABS ─────────────────────────────────── */}
            {ALGO_KEYS.map(algoKey => {
              if (activeTab !== algoKey) return null;
              const result = allResults.algorithms[algoKey];

              if (!result) return (
                <div key={algoKey} className={`rounded-xl p-12 text-center border ${card}`}>
                  <p className={sub}>
                    No data for {algoKey}. Run <code className="font-mono">python run_all.py</code>.
                  </p>
                </div>
              );

              const chartData = result.processStats.map(s => ({
                name:        s.pid,
                Waiting:     s.waitingTime,
                Turnaround:  s.turnaroundTime,
                Response:    s.responseTime,
              }));

              const cpuUtil = parseFloat(result.summary['CPU Utilization'] ?? '0');
              const pieData = [
                { name: 'CPU Busy', value: cpuUtil },
                { name: 'Idle',     value: Math.max(0, 100 - cpuUtil) },
              ];
              const PIE_COLORS = dm ? ['#60A5FA', '#1E293B'] : ['#3B82F6', '#DBEAFE'];

              return (
                <div key={algoKey} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: ALGO_COLORS[algoKey] }} />
                    <h2 className={`text-xl font-bold ${text}`}>{ALGO_LABELS[algoKey]}</h2>
                  </div>

                  {/* Gantt */}
                  <div className={`rounded-xl p-5 border ${card}`}>
                    <h3 className={`font-semibold mb-3 ${text}`}>Gantt Chart (CPU)</h3>
                    <GanttChart gantt={result.ganttChart} dm={dm} />
                  </div>

                  {/* Metrics */}
                  <MetricCards summary={result.summary} dm={dm} />

                  {/* Charts */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className={`rounded-xl p-5 border ${card}`}>
                      <h3 className={`font-semibold mb-4 ${text}`}>Process Time Comparison</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="name" stroke={axisColor} />
                          <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={ttStyle} />
                          <Legend wrapperStyle={legendStyle} />
                          <Bar dataKey="Waiting"    fill="#3B82F6" radius={[4,4,0,0]} />
                          <Bar dataKey="Turnaround" fill="#06B6D4" radius={[4,4,0,0]} />
                          <Bar dataKey="Response"   fill="#0EA5E9" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className={`rounded-xl p-5 border ${card}`}>
                      <h3 className={`font-semibold mb-4 ${text}`}>CPU Utilization</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" outerRadius={80}
                               dataKey="value"
                               label={({ name, percent }) => `${name}: ${(percent*100).toFixed(1)}%`}>
                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                          </Pie>
                          <Tooltip contentStyle={ttStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Process stats table */}
                  <div className={`rounded-xl p-5 border ${card}`}>
                    <h3 className={`font-semibold mb-4 ${text}`}>Process Statistics</h3>
                    <ProcessTable stats={result.processStats} dm={dm} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
