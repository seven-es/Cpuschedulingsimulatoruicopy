#include "scheduler_common.h"

static Process p[MAX_PROCS];
static Gantt gantt[MAX_GANTT];
static int n = 0;
static int gantt_count = 0;
static int cpu_busy = 0;

static int priority_better(int a, int b) {
    if (b == -1) return 1;
    if (p[a].priority != p[b].priority) return p[a].priority < p[b].priority;
    return p[a].arrival < p[b].arrival;
}

static int pick_priority(void) {
    int best = -1;
    for (int i = 0; i < n; i++) {
        if (p[i].state == STATE_READY && priority_better(i, best)) {
            best = i;
        }
    }
    return best;
}

static void simulate_priority(void) {
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
            int best = pick_priority();
            if (best != -1 && priority_better(best, running)) {
                p[running].state = STATE_READY;
                running = -1;
            }
        }

        if (running == -1) {
            running = pick_priority();
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
    int loaded = load_workload_from(p, &n, "Priority_workload.txt");
    if (loaded <= 0) {
        printf("No valid workload found.\n");
        return 1;
    }

    printf("Loaded %d processes from Priority_workload.txt\n", n);
    simulate_priority();
    write_result_files("Priority", p, n, gantt, gantt_count, cpu_busy);
    printf("CSV: Priority_gantt_chart.csv  Priority_process_stats.csv  Priority_summary.csv\n");
    return 0;
}
