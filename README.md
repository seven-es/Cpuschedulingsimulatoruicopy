# CPU Scheduling Simulator

Compares **FCFS, Round Robin, Priority (Preemptive), and SRFJ (SRTF)** side by side — with Gantt charts, per-process stats, and summary metrics.

Each algorithm runs as an independent executable with its own dedicated workload file so there is no cross-algorithm bias.

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **GCC** | Compile the C simulators | Windows: [MinGW-w64](https://www.mingw-w64.org/) · Linux/Mac: `sudo apt install build-essential` |
| **Node.js 18+ & pnpm** | Run the React UI | [nodejs.org](https://nodejs.org/) then `npm i -g pnpm` |

---

## Project Structure

```
algorithms/
  FCFS.c                  ← FCFS simulator
  RR.c                    ← Round Robin simulator
  SRFJ.c                  ← Shortest Remaining First Job simulator
  PriorityQueue.c         ← Preemptive Priority simulator
  scheduler_common.h      ← Shared types and helpers
  workload.h              ← Workload file parser
  FCFS_workload.txt       ← Workload for FCFS
  RR_workload.txt         ← Workload for Round Robin
  SRFJ_workload.txt       ← Workload for SRFJ
  Priority_workload.txt   ← Workload for Priority
src/                      ← React + TypeScript UI
```

---

## Step 1 — Edit the Workload Files

Each algorithm has its own workload file inside `algorithms/`. All four files use the same format.

**Format:**
```
# PID  ARRIVAL  PRIORITY  CPU_BURSTS  IO_BURSTS
```

| Column | Description |
|--------|-------------|
| `PID` | Process name (e.g. `P1`) |
| `ARRIVAL` | Arrival time (integer ≥ 0) |
| `PRIORITY` | Lower number = higher priority. Ignored by FCFS and RR. |
| `CPU_BURSTS` | Single burst: `5` · Multiple bursts: `(5,3,2)` |
| `IO_BURSTS` | No IO: `-` · Single: `4` · Multiple: `(3,2)` |

> **Rule:** CPU burst count must be exactly IO burst count + 1.
> A process with 2 CPU bursts must have exactly 1 IO burst.

**Example (current workload):**
```
# PID ARRIVAL PRIORITY CPU_BURSTS IO_BURSTS
P1 0 2 (5,3) 4
P2 1 1 4 -
P3 2 3 (2,4,3) (3,2)
P4 4 2 6 -
```

**For Round Robin** — add a quantum directive at the top of `RR_workload.txt`:
```
quantum=3
```
Default quantum is 2 if not specified.

---

## Step 2 — Compile

Open a terminal inside the `algorithms/` folder and compile each algorithm:

```bash
cd algorithms

gcc FCFS.c          -o FCFS
gcc RR.c            -o RR
gcc SRFJ.c          -o SRFJ
gcc PriorityQueue.c -o PriorityQueue
```

---

## Step 3 — Run the Simulators

Run from inside the `algorithms/` folder (the executables look for the workload files in the current directory):

**Linux / Mac:**
```bash
./FCFS
./RR
./SRFJ
./PriorityQueue
```

**Windows:**
```cmd
FCFS.exe
RR.exe
SRFJ.exe
PriorityQueue.exe
```

Each run produces three CSV files:

| File | Contents |
|------|----------|
| `ALGO_gantt_chart.csv` | Gantt chart — PID, Start, End |
| `ALGO_process_stats.csv` | Per-process waiting, turnaround, response, finish times |
| `ALGO_summary.csv` | Average metrics, CPU utilization, throughput, context switches |

---

## Step 4 — Run the UI Dashboard

From the **project root**:

```bash
pnpm install      # first time only
pnpm dev
```

Open **http://localhost:5173** in your browser.

The dashboard reads the CSV files produced by the simulators and displays:
- Gantt charts per algorithm
- Per-process statistics table
- Side-by-side summary metrics comparison

---

## Quick Reference

```bash
# 1. Compile all (from algorithms/)
cd algorithms
gcc FCFS.c -o FCFS && gcc RR.c -o RR && gcc SRFJ.c -o SRFJ && gcc PriorityQueue.c -o PriorityQueue

# 2. Run all (from algorithms/)
./FCFS && ./RR && ./SRFJ && ./PriorityQueue

# 3. Start UI (from project root)
cd ..
pnpm dev
```

---

## Common Errors

| Error | Fix |
|-------|-----|
| `Cannot open workload file 'FCFS_workload.txt'` | Run the executable from inside the `algorithms/` folder, not the project root |
| `CPU burst count must be IO burst count + 1` | Check your workload — 2 CPU bursts requires exactly 1 IO burst |
| `pnpm: command not found` | Run `npm install -g pnpm` first |
| Gantt chart missing | Make sure the simulator ran successfully and produced the CSV before opening the UI |
