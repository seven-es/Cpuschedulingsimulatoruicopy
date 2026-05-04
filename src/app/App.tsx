import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Process {
  pid: string;
  arrivalTime: number;
  cpuBursts: number;
  ioBursts: number;
  priority: number;
}

interface GanttBlock {
  pid: string;
  start: number;
  end: number;
  color: string;
}

interface ProcessStats {
  pid: string;
  waitingTime: number;
  turnaroundTime: number;
  responseTime: number;
}

const PROCESS_COLORS = [
  '#3B82F6', '#60A5FA', '#93C5FD', '#2563EB', '#1D4ED8',
  '#1E40AF', '#06B6D4', '#0EA5E9', '#0284C7', '#0369A1'
];

export default function App() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [algorithm, setAlgorithm] = useState<string>('FCFS');
  const [timeQuantum, setTimeQuantum] = useState<number>(2);
  const [ganttChart, setGanttChart] = useState<GanttBlock[]>([]);
  const [stats, setStats] = useState<ProcessStats[]>([]);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [metrics, setMetrics] = useState({
    avgWaitingTime: 0,
    avgTurnaroundTime: 0,
    avgResponseTime: 0,
    cpuUtilization: 0,
    throughput: 0
  });
  const [pendingRun, setPendingRun] = useState(false);

  useEffect(() => {
    let lastInput = 0;
    let lastResults = 0;

    const interval = setInterval(async () => {
      try {
        // cli.js input — populates table and runs JS simulation
        const r1 = await fetch(`/input.json?t=${Date.now()}`);
        if (r1.ok) {
          const d1 = await r1.json();
          if (d1.timestamp !== lastInput) {
            lastInput = d1.timestamp;
            reset();
            if (d1.processes) setProcesses(d1.processes);
            if (d1.algorithm) setAlgorithm(d1.algorithm);
            if (d1.timeQuantum) setTimeQuantum(d1.timeQuantum);
            setPendingRun(true);
          }
        }
      } catch { /* not present yet */ }

      try {
        // PriorityQueue.c output — directly sets results
        const r2 = await fetch(`/results.json?t=${Date.now()}`);
        if (r2.ok) {
          const d2 = await r2.json();
          if (d2.timestamp !== lastResults) {
            lastResults = d2.timestamp;
            const colors = ['#3B82F6','#60A5FA','#93C5FD','#2563EB','#1D4ED8','#1E40AF','#06B6D4','#0EA5E9','#0284C7','#0369A1'];
            const pidIndex: Record<string, number> = {};
            if (d2.ganttChart) {
              d2.ganttChart.forEach((b: any) => { if (!(b.pid in pidIndex)) pidIndex[b.pid] = Object.keys(pidIndex).length; });
              setGanttChart(d2.ganttChart.map((b: any) => ({ ...b, color: b.pid === 'IDLE' ? '#94A3B8' : colors[pidIndex[b.pid] % colors.length] })));
            }
            if (d2.stats) setStats(d2.stats);
            if (d2.metrics) setMetrics(d2.metrics);
            if (d2.algorithm) setAlgorithm(d2.algorithm);
          }
        }
      } catch { /* not present yet */ }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pendingRun && processes.length > 0) {
      runSimulation();
      setPendingRun(false);
    }
  }, [pendingRun, processes, algorithm, timeQuantum]);

  const addProcess = () => {
    const newProcess: Process = {
      pid: `P${processes.length + 1}`,
      arrivalTime: 0,
      cpuBursts: 5,
      ioBursts: 0,
      priority: 1
    };
    setProcesses([...processes, newProcess]);
  };

  const loadSampleData = () => {
    const sampleProcesses: Process[] = [
      { pid: 'P1', arrivalTime: 0, cpuBursts: 8, ioBursts: 2, priority: 2 },
      { pid: 'P2', arrivalTime: 1, cpuBursts: 4, ioBursts: 1, priority: 1 },
      { pid: 'P3', arrivalTime: 2, cpuBursts: 9, ioBursts: 3, priority: 3 },
      { pid: 'P4', arrivalTime: 3, cpuBursts: 5, ioBursts: 2, priority: 2 }
    ];
    setProcesses(sampleProcesses);
  };

  const clearProcesses = () => {
    setProcesses([]);
    setGanttChart([]);
    setStats([]);
    setMetrics({
      avgWaitingTime: 0,
      avgTurnaroundTime: 0,
      avgResponseTime: 0,
      cpuUtilization: 0,
      throughput: 0
    });
  };

  const updateProcess = (index: number, field: keyof Process, value: string | number) => {
    const updated = [...processes];
    updated[index] = { ...updated[index], [field]: value };
    setProcesses(updated);
  };

  const removeProcess = (index: number) => {
    setProcesses(processes.filter((_, i) => i !== index));
  };

  const runSimulation = () => {
    if (processes.length === 0) return;

    let gantt: GanttBlock[] = [];
    let processStats: ProcessStats[] = [];

    const sortedProcesses = [...processes].sort((a, b) => a.arrivalTime - b.arrivalTime);

    if (algorithm === 'FCFS') {
      let currentTime = 0;
      sortedProcesses.forEach((proc, idx) => {
        const start = Math.max(currentTime, proc.arrivalTime);
        const end = start + proc.cpuBursts;

        gantt.push({
          pid: proc.pid,
          start,
          end,
          color: PROCESS_COLORS[idx % PROCESS_COLORS.length]
        });

        processStats.push({
          pid: proc.pid,
          waitingTime: start - proc.arrivalTime,
          turnaroundTime: end - proc.arrivalTime,
          responseTime: start - proc.arrivalTime
        });

        currentTime = end;
      });
    } else if (algorithm === 'SRJF') {
      let currentTime = 0;
      let remainingProcesses = sortedProcesses.map(p => ({ ...p, remaining: p.cpuBursts }));
      let completed = 0;
      let firstResponse: Record<string, number> = {};

      while (completed < remainingProcesses.length) {
        const available = remainingProcesses.filter(
          p => p.arrivalTime <= currentTime && p.remaining > 0
        );

        if (available.length === 0) {
          currentTime++;
          continue;
        }

        const shortest = available.reduce((min, p) =>
          p.remaining < min.remaining ? p : min
        );

        const idx = sortedProcesses.findIndex(p => p.pid === shortest.pid);

        if (!(shortest.pid in firstResponse)) {
          firstResponse[shortest.pid] = currentTime;
        }

        gantt.push({
          pid: shortest.pid,
          start: currentTime,
          end: currentTime + 1,
          color: PROCESS_COLORS[idx % PROCESS_COLORS.length]
        });

        shortest.remaining--;
        currentTime++;

        if (shortest.remaining === 0) {
          completed++;
          const original = sortedProcesses.find(p => p.pid === shortest.pid)!;
          processStats.push({
            pid: shortest.pid,
            turnaroundTime: currentTime - original.arrivalTime,
            waitingTime: currentTime - original.arrivalTime - original.cpuBursts,
            responseTime: firstResponse[shortest.pid] - original.arrivalTime
          });
        }
      }

      gantt = mergeAdjacentBlocks(gantt);
    } else if (algorithm === 'Round Robin') {
      let currentTime = 0;
      const procs = sortedProcesses.map((p, i) => ({ ...p, remaining: p.cpuBursts, colorIdx: i }));
      const firstResponse: Record<string, number> = {};
      const readyQueue: (typeof procs[0])[] = [];
      let admitted = 0;
      let completed = 0;

      while (admitted < procs.length && procs[admitted].arrivalTime <= currentTime)
        readyQueue.push(procs[admitted++]);

      while (completed < procs.length) {
        if (readyQueue.length === 0) {
          currentTime = procs[admitted].arrivalTime;
          while (admitted < procs.length && procs[admitted].arrivalTime <= currentTime)
            readyQueue.push(procs[admitted++]);
          continue;
        }

        const proc = readyQueue.shift()!;
        const executeTime = Math.min(timeQuantum, proc.remaining);

        if (!(proc.pid in firstResponse)) firstResponse[proc.pid] = currentTime;

        gantt.push({ pid: proc.pid, start: currentTime, end: currentTime + executeTime, color: PROCESS_COLORS[proc.colorIdx % PROCESS_COLORS.length] });

        proc.remaining -= executeTime;
        currentTime += executeTime;

        while (admitted < procs.length && procs[admitted].arrivalTime <= currentTime)
          readyQueue.push(procs[admitted++]);

        if (proc.remaining === 0) {
          completed++;
          processStats.push({
            pid: proc.pid,
            turnaroundTime: currentTime - proc.arrivalTime,
            waitingTime: currentTime - proc.arrivalTime - proc.cpuBursts,
            responseTime: firstResponse[proc.pid] - proc.arrivalTime
          });
        } else {
          readyQueue.push(proc);
        }
      }
    } else if (algorithm === 'Priority (Preemptive)') {
      let currentTime = 0;
      let remainingProcesses = sortedProcesses.map(p => ({ ...p, remaining: p.cpuBursts }));
      let completed = 0;
      let firstResponse: Record<string, number> = {};

      while (completed < remainingProcesses.length) {
        const available = remainingProcesses.filter(
          p => p.arrivalTime <= currentTime && p.remaining > 0
        );

        if (available.length === 0) {
          currentTime++;
          continue;
        }

        const highestPriority = available.reduce((max, p) =>
          p.priority > max.priority ? p : max
        );

        const idx = sortedProcesses.findIndex(p => p.pid === highestPriority.pid);

        if (!(highestPriority.pid in firstResponse)) {
          firstResponse[highestPriority.pid] = currentTime;
        }

        gantt.push({
          pid: highestPriority.pid,
          start: currentTime,
          end: currentTime + 1,
          color: PROCESS_COLORS[idx % PROCESS_COLORS.length]
        });

        highestPriority.remaining--;
        currentTime++;

        if (highestPriority.remaining === 0) {
          completed++;
          const original = sortedProcesses.find(p => p.pid === highestPriority.pid)!;
          processStats.push({
            pid: highestPriority.pid,
            turnaroundTime: currentTime - original.arrivalTime,
            waitingTime: currentTime - original.arrivalTime - original.cpuBursts,
            responseTime: firstResponse[highestPriority.pid] - original.arrivalTime
          });
        }
      }

      gantt = mergeAdjacentBlocks(gantt);
    }

    const totalTime = gantt.length > 0 ? gantt[gantt.length - 1].end : 0;
    const avgWT = processStats.reduce((sum, p) => sum + p.waitingTime, 0) / processStats.length;
    const avgTAT = processStats.reduce((sum, p) => sum + p.turnaroundTime, 0) / processStats.length;
    const avgRT = processStats.reduce((sum, p) => sum + p.responseTime, 0) / processStats.length;
    const cpuTime = gantt.reduce((sum, b) => sum + (b.end - b.start), 0);

    setGanttChart(gantt);
    setStats(processStats.sort((a, b) => a.pid.localeCompare(b.pid)));
    setMetrics({
      avgWaitingTime: parseFloat(avgWT.toFixed(2)),
      avgTurnaroundTime: parseFloat(avgTAT.toFixed(2)),
      avgResponseTime: parseFloat(avgRT.toFixed(2)),
      cpuUtilization: parseFloat(((cpuTime / totalTime) * 100).toFixed(2)),
      throughput: parseFloat((processStats.length / totalTime).toFixed(2))
    });
  };

  const mergeAdjacentBlocks = (blocks: GanttBlock[]): GanttBlock[] => {
    if (blocks.length === 0) return [];

    const merged: GanttBlock[] = [blocks[0]];

    for (let i = 1; i < blocks.length; i++) {
      const last = merged[merged.length - 1];
      const current = blocks[i];

      if (last.pid === current.pid && last.end === current.start) {
        last.end = current.end;
      } else {
        merged.push(current);
      }
    }

    return merged;
  };

  const reset = () => {
    setGanttChart([]);
    setStats([]);
    setMetrics({
      avgWaitingTime: 0,
      avgTurnaroundTime: 0,
      avgResponseTime: 0,
      cpuUtilization: 0,
      throughput: 0
    });
  };

  const maxTime = ganttChart.length > 0 ? ganttChart[ganttChart.length - 1].end : 0;

  const chartData = stats.map((stat) => ({
    name: stat.pid,
    'Waiting Time': stat.waitingTime,
    'Turnaround Time': stat.turnaroundTime,
    'Response Time': stat.responseTime
  }));

  const pieData = [
    { name: 'CPU Time', value: metrics.cpuUtilization },
    { name: 'Idle Time', value: 100 - metrics.cpuUtilization }
  ];

  const PIE_COLORS = darkMode ? ['#60A5FA', '#0F172A'] : ['#3B82F6', '#E0E7FF'];

  const renderPieLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={darkMode ? '#E0E7FF' : '#1E40AF'}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-sm font-medium"
      >
        {`${name}: ${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${
      darkMode
        ? 'bg-gradient-to-br from-black via-slate-950 to-black'
        : 'bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50'
    }`}>
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className={`text-3xl ${darkMode ? 'text-blue-50' : 'text-blue-900'}`}>
              CPU Scheduling Simulator
            </h1>
            <p className={`mt-1 ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>
              Educational tool for understanding CPU scheduling algorithms
            </p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`px-6 py-3 rounded-lg transition-all shadow-lg ${
              darkMode
                ? 'bg-slate-800 text-blue-100 hover:bg-slate-700 border border-blue-800'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </header>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4">
            <div className={`rounded-xl shadow-lg p-6 border ${
              darkMode
                ? 'bg-slate-950 border-slate-800'
                : 'bg-white border-blue-200'
            }`}>
              <h2 className={darkMode ? 'text-blue-50 mb-4' : 'text-blue-900 mb-4'}>Input Panel</h2>

              <div className="space-y-4">
                <div>
                  <label className={`block mb-3 ${darkMode ? 'text-blue-100' : 'text-blue-800'}`}>
                    Process Table
                  </label>
                  <div className={`border rounded-lg overflow-hidden ${
                    darkMode ? 'border-slate-800' : 'border-blue-200'
                  }`}>
                    <div className={`p-3 ${darkMode ? 'bg-black' : 'bg-blue-50'}`}>
                      <div className="grid grid-cols-6 gap-2 text-sm">
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>PID</div>
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>Arrival</div>
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>CPU</div>
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>I/O</div>
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>Priority</div>
                        <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}></div>
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                      {processes.map((proc, idx) => (
                        <div key={idx} className={`grid grid-cols-6 gap-2 p-3 border-t items-center ${
                          darkMode
                            ? 'border-slate-900 hover:bg-slate-900'
                            : 'border-blue-100 hover:bg-blue-50'
                        }`}>
                          <input
                            type="text"
                            value={proc.pid}
                            onChange={(e) => updateProcess(idx, 'pid', e.target.value)}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none ${
                              darkMode
                                ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                                : 'bg-white border-blue-200 focus:border-blue-400'
                            }`}
                          />
                          <input
                            type="number"
                            value={proc.arrivalTime}
                            onChange={(e) => updateProcess(idx, 'arrivalTime', parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none ${
                              darkMode
                                ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                                : 'bg-white border-blue-200 focus:border-blue-400'
                            }`}
                          />
                          <input
                            type="number"
                            value={proc.cpuBursts}
                            onChange={(e) => updateProcess(idx, 'cpuBursts', parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none ${
                              darkMode
                                ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                                : 'bg-white border-blue-200 focus:border-blue-400'
                            }`}
                          />
                          <input
                            type="number"
                            value={proc.ioBursts}
                            onChange={(e) => updateProcess(idx, 'ioBursts', parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none ${
                              darkMode
                                ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                                : 'bg-white border-blue-200 focus:border-blue-400'
                            }`}
                          />
                          <input
                            type="number"
                            value={proc.priority}
                            onChange={(e) => updateProcess(idx, 'priority', parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none ${
                              darkMode
                                ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                                : 'bg-white border-blue-200 focus:border-blue-400'
                            }`}
                          />
                          <button
                            onClick={() => removeProcess(idx)}
                            className={`rounded px-2 py-1 text-lg ${
                              darkMode
                                ? 'text-red-400 hover:text-red-200 hover:bg-red-950'
                                : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                            }`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={addProcess}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Add Process
                  </button>
                  <button
                    onClick={loadSampleData}
                    className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors shadow-sm"
                  >
                    Load Sample
                  </button>
                </div>

                <button
                  onClick={clearProcesses}
                  className="w-full px-4 py-2.5 border-2 border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Clear All
                </button>

                <div className={`pt-4 border-t ${darkMode ? 'border-slate-900' : 'border-blue-200'}`}>
                  <label className={`block mb-2 ${darkMode ? 'text-blue-100' : 'text-blue-800'}`}>
                    Scheduling Algorithm
                  </label>
                  <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                    className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none ${
                      darkMode
                        ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                        : 'bg-white border-blue-300 focus:border-blue-500'
                    }`}
                  >
                    <option value="FCFS">First Come First Serve</option>
                    <option value="SRJF">Shortest Remaining Job First</option>
                    <option value="Round Robin">Round Robin</option>
                    <option value="Priority (Preemptive)">Priority (Preemptive)</option>
                  </select>
                </div>

                {algorithm === 'Round Robin' && (
                  <div>
                    <label className={`block mb-2 ${darkMode ? 'text-blue-100' : 'text-blue-800'}`}>
                      Time Quantum
                    </label>
                    <input
                      type="number"
                      value={timeQuantum}
                      onChange={(e) => setTimeQuantum(parseInt(e.target.value) || 1)}
                      className={`w-full px-3 py-2.5 border-2 rounded-lg focus:outline-none ${
                        darkMode
                          ? 'bg-black border-slate-700 text-blue-50 focus:border-blue-500'
                          : 'bg-white border-blue-300 focus:border-blue-500'
                      }`}
                      min="1"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-8 space-y-6">
            <div className={`rounded-xl shadow-lg p-5 border ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={darkMode ? 'text-blue-50' : 'text-blue-900'}>Simulation Controls</h2>
                <div className="flex gap-3">
                  <button
                    onClick={runSimulation}
                    className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-md"
                  >
                    Run
                  </button>
                  <button
                    onClick={reset}
                    className="px-8 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className={`rounded-xl shadow-lg p-5 border ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200'
            }`}>
              <h3 className={`mb-4 ${darkMode ? 'text-blue-50' : 'text-blue-900'}`}>Gantt Chart</h3>

              {ganttChart.length > 0 ? (
                <div className="space-y-4">
                  <div className={`relative h-20 rounded-lg border-2 overflow-visible ${
                    darkMode
                      ? 'bg-black border-slate-700'
                      : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200'
                  }`}>
                    <div className="absolute inset-0 flex">
                      {ganttChart.map((block, idx) => (
                        <div
                          key={idx}
                          className="group relative flex items-center justify-center border-r-2 border-white shadow-sm cursor-pointer"
                          style={{ width: `${((block.end - block.start) / maxTime) * 100}%`, backgroundColor: block.color }}
                        >
                          <span className="text-white font-medium drop-shadow text-sm">{block.pid}</span>

                          {/* Tooltip */}
                          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10
                            opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150
                            text-xs rounded-lg shadow-lg px-3 py-2 whitespace-nowrap
                            ${darkMode ? 'bg-slate-800 text-blue-100 border border-slate-600' : 'bg-white text-blue-900 border border-blue-200'}`}>
                            <div className="font-semibold mb-1">{block.pid}</div>
                            <div>Start : {block.start}</div>
                            <div>End   : {block.end}</div>
                            <div>Duration : {block.end - block.start}</div>
                            {/* Arrow */}
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent
                              ${darkMode ? 'border-t-slate-800' : 'border-t-white'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative h-8">
                    <div className={`absolute inset-0 flex text-xs font-medium ${
                      darkMode ? 'text-blue-200' : 'text-blue-700'
                    }`}>
                      {ganttChart.map((block, idx) => (
                        <div key={idx} style={{ width: `${((block.end - block.start) / maxTime) * 100}%` }} className="relative">
                          {idx === 0 && (
                            <div className="absolute left-0">
                              <span className="font-bold">{block.start}</span>
                            </div>
                          )}
                          <div className="absolute right-0">
                            <span className="font-bold">{block.end}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`h-24 rounded-lg border-2 flex items-center justify-center ${
                  darkMode
                    ? 'bg-black border-slate-700 text-blue-300'
                    : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-400'
                }`}>
                  Run simulation to see Gantt chart
                </div>
              )}
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-5 text-white">
                <div className="text-blue-100 text-xs mb-2">Avg Waiting Time</div>
                <div className="text-3xl font-medium">{metrics.avgWaitingTime}</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg p-5 text-white">
                <div className="text-cyan-100 text-xs mb-2">Avg Turnaround</div>
                <div className="text-3xl font-medium">{metrics.avgTurnaroundTime}</div>
              </div>
              <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl shadow-lg p-5 text-white">
                <div className="text-sky-100 text-xs mb-2">Avg Response</div>
                <div className="text-3xl font-medium">{metrics.avgResponseTime}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg p-5 text-white">
                <div className="text-blue-100 text-xs mb-2">CPU Utilization</div>
                <div className="text-3xl font-medium">{metrics.cpuUtilization}%</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-5 text-white">
                <div className="text-indigo-100 text-xs mb-2">Throughput</div>
                <div className="text-3xl font-medium">{metrics.throughput}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className={`rounded-xl shadow-lg p-5 border ${
                darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200'
              }`}>
                <h3 className={`mb-4 ${darkMode ? 'text-blue-50' : 'text-blue-900'}`}>
                  Process Time Comparison
                </h3>
                {stats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1E293B' : '#BFDBFE'} />
                      <XAxis dataKey="name" stroke={darkMode ? '#60A5FA' : '#1E40AF'} />
                      <YAxis stroke={darkMode ? '#60A5FA' : '#1E40AF'} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#0F172A' : '#EFF6FF',
                          border: `1px solid ${darkMode ? '#1E293B' : '#BFDBFE'}`,
                          borderRadius: '8px',
                          color: darkMode ? '#DBEAFE' : '#1E40AF'
                        }}
                      />
                      <Legend wrapperStyle={{ color: darkMode ? '#DBEAFE' : '#1E40AF' }} />
                      <Bar dataKey="Waiting Time" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="Turnaround Time" fill="#06B6D4" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="Response Time" fill="#0EA5E9" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`h-64 rounded-lg border-2 flex items-center justify-center ${
                    darkMode
                      ? 'bg-black border-slate-700 text-blue-300'
                      : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-400'
                  }`}>
                    Run simulation to see comparison chart
                  </div>
                )}
              </div>

              <div className={`rounded-xl shadow-lg p-5 border ${
                darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200'
              }`}>
                <h3 className={`mb-4 ${darkMode ? 'text-blue-50' : 'text-blue-900'}`}>
                  CPU Utilization
                </h3>
                {stats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={renderPieLabel}
                        outerRadius={70}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#0F172A' : '#EFF6FF',
                          border: `1px solid ${darkMode ? '#1E293B' : '#BFDBFE'}`,
                          borderRadius: '8px',
                          color: darkMode ? '#DBEAFE' : '#1E40AF'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`h-64 rounded-lg border-2 flex items-center justify-center ${
                    darkMode
                      ? 'bg-black border-slate-700 text-blue-300'
                      : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-400'
                  }`}>
                    Run simulation to see utilization
                  </div>
                )}
              </div>
            </div>

            <div className={`rounded-xl shadow-lg p-5 border ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-blue-200'
            }`}>
              <h3 className={`mb-4 ${darkMode ? 'text-blue-50' : 'text-blue-900'}`}>
                Process Statistics
              </h3>

              {stats.length > 0 ? (
                <div className={`border-2 rounded-lg overflow-hidden ${
                  darkMode ? 'border-slate-800' : 'border-blue-200'
                }`}>
                  <div className={`grid grid-cols-4 gap-4 p-4 ${
                    darkMode
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                  }`}>
                    <div className="font-medium text-white">Process ID</div>
                    <div className="font-medium text-white">Waiting Time</div>
                    <div className="font-medium text-white">Turnaround Time</div>
                    <div className="font-medium text-white">Response Time</div>
                  </div>

                  {stats.map((stat, idx) => (
                    <div key={idx} className={`grid grid-cols-4 gap-4 p-4 border-t-2 ${
                      darkMode
                        ? `border-slate-900 ${idx % 2 === 0 ? 'bg-black' : 'bg-slate-950'}`
                        : `border-blue-100 ${idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}`
                    }`}>
                      <div className={`font-medium ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                        {stat.pid}
                      </div>
                      <div className={darkMode ? 'text-blue-200' : 'text-blue-700'}>
                        {stat.waitingTime}
                      </div>
                      <div className={darkMode ? 'text-blue-200' : 'text-blue-700'}>
                        {stat.turnaroundTime}
                      </div>
                      <div className={darkMode ? 'text-blue-200' : 'text-blue-700'}>
                        {stat.responseTime}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`h-32 rounded-lg border-2 flex items-center justify-center ${
                  darkMode
                    ? 'bg-black border-slate-700 text-blue-300'
                    : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-400'
                }`}>
                  Run simulation to see process statistics
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}