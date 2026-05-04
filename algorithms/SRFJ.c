#include <stdio.h>
#include <limits.h>

#define MAX 10

typedef struct {
    int pid;
    int arrival;
    int burst;
    int remaining;
    int completion;
    int waiting;
    int turnaround;
} Process;

/* Returns index of process with shortest remaining time that has arrived.
   Returns -1 if no process is ready. */
static int pick_shortest(Process p[], int n, int current_time) {
    int idx = -1;
    int min_remaining = INT_MAX;

    for (int i = 0; i < n; i++) {
        if (p[i].arrival <= current_time && p[i].remaining > 0) {
            if (p[i].remaining < min_remaining) {
                min_remaining = p[i].remaining;
                idx = i;
            }
        }
    }
    return idx;
}

static int all_done(Process p[], int n) {
    for (int i = 0; i < n; i++)
        if (p[i].remaining > 0) return 0;
    return 1;
}

void srfj(Process p[], int n) {
    int time = 0;

    /* Find the earliest arrival so we don't spin from time 0 unnecessarily */
    int start = INT_MAX;
    for (int i = 0; i < n; i++)
        if (p[i].arrival < start) start = p[i].arrival;
    time = start;

    while (!all_done(p, n)) {
        int idx = pick_shortest(p, n, time);

        if (idx == -1) {
            int next = INT_MAX;
            for (int i = 0; i < n; i++)
                if (p[i].remaining > 0 && p[i].arrival > time && p[i].arrival < next)
                    next = p[i].arrival;
            time = next;
            continue;
        }

        p[idx].remaining--;
        time++;

        if (p[idx].remaining == 0) {
            p[idx].completion = time;
            p[idx].turnaround = p[idx].completion - p[idx].arrival;
            p[idx].waiting    = p[idx].turnaround - p[idx].burst;
        }
    }

    /* ── Results table ───────────────────────────────────── */
    printf("\n=== Process Results ===\n");
    printf("%-6s %-10s %-8s %-12s %-12s %-10s\n",
           "PID", "Arrival", "Burst", "Completion", "Turnaround", "Waiting");
    printf("------------------------------------------------------------\n");

    float total_wt = 0, total_tat = 0;
    for (int i = 0; i < n; i++) {
        printf("%-6d %-10d %-8d %-12d %-12d %-10d\n",
               p[i].pid, p[i].arrival, p[i].burst,
               p[i].completion, p[i].turnaround, p[i].waiting);
        total_wt  += p[i].waiting;
        total_tat += p[i].turnaround;
    }

    printf("\nAverage Waiting Time    : %.2f\n", total_wt  / n);
    printf("Average Turnaround Time : %.2f\n", total_tat / n);
}

int main(void) {
    int n;
    Process p[MAX];

    printf("Enter number of processes (max %d): ", MAX);
    scanf("%d", &n);

    for (int i = 0; i < n; i++) {
        p[i].pid     = i + 1;
        printf("\nProcess P%d:\n", p[i].pid);
        printf("  Arrival time : ");
        scanf("%d", &p[i].arrival);
        printf("  Burst time   : ");
        scanf("%d", &p[i].burst);
        p[i].remaining = p[i].burst;
    }

    srfj(p, n);
    return 0;
}
