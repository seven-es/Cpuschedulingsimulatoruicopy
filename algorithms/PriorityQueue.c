#include <stdio.h>
#include <string.h>
#include <time.h>

#define MAX 10

typedef struct {
    char pid[8];
    int  arrival;
    int  burst;
    int  priority;
    int  remaining;
    int  completion;
    int  waiting;
    int  turnaround;
    int  response;
    int  started;
} Process;

typedef struct {
    char pid[8];
    int  start;
    int  end;
} Gantt;

Process p[MAX];
int     n;

Gantt gantt[5000];
int   ganttCount = 0;
int   cpuBusy    = 0;

static int pick_highest(int t) {
    int idx = -1;
    for (int i = 0; i < n; i++) {
        if (p[i].arrival <= t && p[i].remaining > 0) {
            if (idx == -1 ||
                p[i].priority < p[idx].priority ||
               (p[i].priority == p[idx].priority && p[i].arrival < p[idx].arrival))
                idx = i;
        }
    }
    return idx;
}

static int all_done() {
    for (int i = 0; i < n; i++) if (p[i].remaining > 0) return 0;
    return 1;
}

void addGantt(char pid[], int start, int end) {
    if (start >= end) return;
    if (ganttCount > 0 &&
        strcmp(gantt[ganttCount - 1].pid, pid) == 0 &&
        gantt[ganttCount - 1].end == start) {
        gantt[ganttCount - 1].end = end;
        return;
    }
    strcpy(gantt[ganttCount].pid, pid);
    gantt[ganttCount].start = start;
    gantt[ganttCount].end   = end;
    ganttCount++;
}

void priorityQueue() {
    int start = 0;
    for (int i = 0; i < n; i++) if (p[i].arrival < start || i == 0) start = p[i].arrival;
    int t = start;

    while (!all_done()) {
        int idx = pick_highest(t);
        if (idx == -1) {
            int next = t + 1;
            for (int i = 0; i < n; i++)
                if (p[i].remaining > 0 && p[i].arrival > t && p[i].arrival < next)
                    next = p[i].arrival;
            addGantt("IDLE", t, next);
            t = next;
            continue;
        }
        if (!p[idx].started) { p[idx].response = t - p[idx].arrival; p[idx].started = 1; }
        addGantt(p[idx].pid, t, t + 1);
        p[idx].remaining--;
        cpuBusy++;
        t++;
        if (p[idx].remaining == 0) {
            p[idx].completion = t;
            p[idx].turnaround = t - p[idx].arrival;
            p[idx].waiting    = p[idx].turnaround - p[idx].burst;
        }
    }
}

void writeResults() {
    FILE *fp = fopen("public/results.json", "w");
    if (!fp) fp = fopen("../public/results.json", "w");
    if (!fp) { printf("Warning: could not write results.json\n"); return; }

    int finish = ganttCount > 0 ? gantt[ganttCount - 1].end : 0;
    double avgWait = 0, avgTurn = 0, avgResp = 0;
    for (int i = 0; i < n; i++) {
        avgWait += p[i].waiting;
        avgTurn += p[i].turnaround;
        avgResp += p[i].response;
    }
    avgWait /= n; avgTurn /= n; avgResp /= n;

    fprintf(fp, "{\n");
    fprintf(fp, "  \"timestamp\": %ld,\n", (long)time(NULL));
    fprintf(fp, "  \"algorithm\": \"Priority (Preemptive)\",\n");

    fprintf(fp, "  \"ganttChart\": [\n");
    for (int i = 0; i < ganttCount; i++)
        fprintf(fp, "    {\"pid\": \"%s\", \"start\": %d, \"end\": %d}%s\n",
            gantt[i].pid, gantt[i].start, gantt[i].end,
            i < ganttCount - 1 ? "," : "");
    fprintf(fp, "  ],\n");

    fprintf(fp, "  \"stats\": [\n");
    for (int i = 0; i < n; i++)
        fprintf(fp, "    {\"pid\": \"%s\", \"waitingTime\": %d, \"turnaroundTime\": %d, \"responseTime\": %d}%s\n",
            p[i].pid, p[i].waiting, p[i].turnaround, p[i].response,
            i < n - 1 ? "," : "");
    fprintf(fp, "  ],\n");

    fprintf(fp, "  \"metrics\": {\n");
    fprintf(fp, "    \"avgWaitingTime\": %.2f,\n",    avgWait);
    fprintf(fp, "    \"avgTurnaroundTime\": %.2f,\n", avgTurn);
    fprintf(fp, "    \"avgResponseTime\": %.2f,\n",   avgResp);
    fprintf(fp, "    \"cpuUtilization\": %.2f,\n",
        finish > 0 ? (100.0 * cpuBusy / finish) : 0.0);
    fprintf(fp, "    \"throughput\": %.2f\n",
        finish > 0 ? ((double)n / finish) : 0.0);
    fprintf(fp, "  }\n}\n");

    fclose(fp);
}

int main(void) {
    printf("Enter number of processes (max %d): ", MAX);
    scanf("%d", &n);

    for (int i = 0; i < n; i++) {
        sprintf(p[i].pid, "P%d", i + 1);
        printf("\nProcess P%d:\n", i + 1);
        printf("  Arrival time : ");
        scanf("%d", &p[i].arrival);
        printf("  Burst time   : ");
        scanf("%d", &p[i].burst);
        printf("  Priority     : ");
        scanf("%d", &p[i].priority);
        p[i].remaining = p[i].burst;
        p[i].started   = 0;
    }

    priorityQueue();

    printf("\n=== Process Results ===\n");
    printf("%-6s %-10s %-8s %-10s %-12s %-12s %-10s\n",
           "PID", "Arrival", "Burst", "Priority", "Completion", "Turnaround", "Waiting");
    printf("------------------------------------------------------------------------\n");
    float total_wt = 0, total_tat = 0;
    for (int i = 0; i < n; i++) {
        printf("%-6s %-10d %-8d %-10d %-12d %-12d %-10d\n",
               p[i].pid, p[i].arrival, p[i].burst, p[i].priority,
               p[i].completion, p[i].turnaround, p[i].waiting);
        total_wt  += p[i].waiting;
        total_tat += p[i].turnaround;
    }
    printf("\nAverage Waiting Time    : %.2f\n", total_wt  / n);
    printf("Average Turnaround Time : %.2f\n",  total_tat / n);

    writeResults();
    printf("\nResults also sent to the UI.\n");
    return 0;
}
