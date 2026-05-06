#include "scheduler_common.h"

static Process p[MAX_PROCS];
static Gantt gantt[MAX_GANTT];
static int n = 0;
static int gantt_count = 0;
static int cpu_busy = 0;

static void simulate_rr(int quantum) {
    Queue ready;
    int io_complete_time[MAX_PROCS];
    int completed = 0;
    int running = -1;
    int pending_requeue = -1;
    int quantum_remaining = 0;
    int t = 0;

    queue_init(&ready);
    init_processes(p, n, io_complete_time);
    gantt_count = 0;
    cpu_busy = 0;

    while (completed < n) {
        for (int i = 0; i < n; i++) {
            if (p[i].state == STATE_NEW && p[i].arrival <= t) {
                p[i].state = STATE_READY;
                enqueue(&ready, i);
            }
        }

        for (int i = 0; i < n; i++) {
            if (p[i].state == STATE_WAITING && io_complete_time[i] == t) {
                finish_io(p, i, io_complete_time);
                enqueue(&ready, i);
            }
        }

        if (pending_requeue != -1) {
            enqueue(&ready, pending_requeue);
            pending_requeue = -1;
        }

        if (running == -1 && !queue_empty(&ready)) {
            running = dequeue(&ready);
            p[running].state = STATE_RUNNING;
            quantum_remaining = quantum;

            if (!p[running].started) {
                p[running].response = t - p[running].arrival;
                p[running].started = 1;
            }
        }

        if (running != -1) {
            add_gantt(gantt, &gantt_count, p[running].pid, t);
            p[running].cpu_remaining--;
            quantum_remaining--;
            cpu_busy++;

            if (p[running].cpu_remaining == 0) {
                complete_cpu_burst(p, running, t + 1, io_complete_time, &completed);
                running = -1;
            } else if (quantum_remaining == 0) {
                p[running].state = STATE_READY;
                pending_requeue = running;
                running = -1;
            }
        } else {
            add_gantt(gantt, &gantt_count, "IDLE", t);
        }

        t++;
    }
}

int main(void) {
    int loaded = load_workload_from(p, &n, "RR_workload.txt");
    if (loaded <= 0) {
        printf("No valid workload found.\n");
        return 1;
    }

    if (wl_quantum <= 0) wl_quantum = 2;

    printf("Loaded %d processes from RR_workload.txt (quantum=%d)\n", n, wl_quantum);
    simulate_rr(wl_quantum);
    write_result_files("RR", p, n, gantt, gantt_count, cpu_busy);
    printf("CSV: RR_gantt_chart.csv  RR_process_stats.csv  RR_summary.csv\n");
    return 0;
}
