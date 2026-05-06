#include "scheduler_common.h"

static Process p[MAX_PROCS];
static Gantt gantt[MAX_GANTT];
static int n = 0;
static int gantt_count = 0;
static int cpu_busy = 0;

static int srfj_better(int a, int b) {
    if (b == -1) return 1;
    if (p[a].cpu_remaining != p[b].cpu_remaining) {
        return p[a].cpu_remaining < p[b].cpu_remaining;
    }
    return p[a].arrival < p[b].arrival;
}

static int pick_srfj(void) {
    int best = -1;
    for (int i = 0; i < n; i++) {
        if (p[i].state == STATE_READY && srfj_better(i, best)) {
            best = i;
        }
    }
    return best;
}

static void simulate_srfj(void) {
    int io_complete_time[MAX_PROCS];
    int completed = 0;
    int running = -1;
    int t = 0;

    init_processes(p, n, io_complete_time);
    gantt_count = 0;
    cpu_busy = 0;

    while (completed < n) {
        for (int i = 0; i < n; i++) {
            if (p[i].state == STATE_NEW && p[i].arrival <= t) {
                p[i].state = STATE_READY;
            }
        }

        for (int i = 0; i < n; i++) {
            if (p[i].state == STATE_WAITING && io_complete_time[i] == t) {
                finish_io(p, i, io_complete_time);
            }
        }

        if (running != -1) {
            int best = pick_srfj();
            if (best != -1 && srfj_better(best, running)) {
                p[running].state = STATE_READY;
                running = -1;
            }
        }

        if (running == -1) {
            running = pick_srfj();
            if (running != -1) {
                p[running].state = STATE_RUNNING;
                if (!p[running].started) {
                    p[running].response = t - p[running].arrival;
                    p[running].started = 1;
                }
            }
        }

        if (running != -1) {
            add_gantt(gantt, &gantt_count, p[running].pid, t);
            p[running].cpu_remaining--;
            cpu_busy++;

            if (p[running].cpu_remaining == 0) {
                complete_cpu_burst(p, running, t + 1, io_complete_time, &completed);
                running = -1;
            }
        } else {
            add_gantt(gantt, &gantt_count, "IDLE", t);
        }

        t++;
    }
}

int main(void) {
    int loaded = load_workload_from(p, &n, "SRFJ_workload.txt");
    if (loaded <= 0) {
        printf("No valid workload found.\n");
        return 1;
    }

    printf("Loaded %d processes from SRFJ_workload.txt\n", n);
    simulate_srfj();
    write_result_files("SRFJ", p, n, gantt, gantt_count, cpu_busy);
    printf("CSV: SRFJ_gantt_chart.csv  SRFJ_process_stats.csv  SRFJ_summary.csv\n");
    return 0;
}
