#include <stdio.h>
#include <string.h>
#include <time.h>

#define MAX 10

typedef struct {
    char pid[8];
    int  arrival;
    int  burst;
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

int queue[5000];
int qFront = 0, qRear = 0;

void enqueue(int idx) { queue[qRear++] = idx; }
int  dequeue()        { return queue[qFront++]; }
int  qEmpty()         { return qFront == qRear; }

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

void roundRobin(int quantum) {
    int completed = 0;
    int inQueue[MAX] = {0};
    int t = 0;

    for (int i = 0; i < n; i++)
        if (p[i].arrival == 0) { enqueue(i); inQueue[i] = 1; }

    while (completed < n) {
        if (qEmpty()) {
            int next = t + 1;
            for (int i = 0; i < n; i++)
                if (p[i].remaining > 0 && p[i].arrival > t && p[i].arrival < next)
                    next = p[i].arrival;
            addGantt("IDLE", t, next);
            t = next;
            for (int i = 0; i < n; i++)
                if (!inQueue[i] && p[i].remaining > 0 && p[i].arrival <= t)
                    { enqueue(i); inQueue[i] = 1; }
            continue;
        }

        int idx   = dequeue();
        int slice = p[idx].remaining < quantum ? p[idx].remaining : quantum;

        if (!p[idx].started) { p[idx].response = t - p[idx].arrival; p[idx].started = 1; }
        addGantt(p[idx].pid, t, t + slice);
        p[idx].remaining -= slice;
        cpuBusy          += slice;
        t                += slice;

        for (int i = 0; i < n; i++)
            if (!inQueue[i] && p[i].remaining > 0 && p[i].arrival <= t)
                { enqueue(i); inQueue[i] = 1; }

        if (p[idx].remaining == 0) {
            p[idx].completion = t;
            p[idx].turnaround = t - p[idx].arrival;
            p[idx].waiting    = p[idx].turnaround - p[idx].burst;
            completed++;
        } else {
            enqueue(idx);
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
    fprintf(fp, "  \"algorithm\": \"Round Robin\",\n");

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
        p[i].remaining = p[i].burst;
        p[i].started   = 0;
    }

    int quantum;
    printf("\nTime quantum : ");
    scanf("%d", &quantum);

    roundRobin(quantum);

    printf("\n=== Process Results ===\n");
    printf("%-6s %-10s %-8s %-12s %-12s %-10s %-10s\n",
           "PID", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Response");
    printf("------------------------------------------------------------------------\n");
    float total_wt = 0, total_tat = 0;
    for (int i = 0; i < n; i++) {
        printf("%-6s %-10d %-8d %-12d %-12d %-10d %-10d\n",
               p[i].pid, p[i].arrival, p[i].burst,
               p[i].completion, p[i].turnaround, p[i].waiting, p[i].response);
        total_wt  += p[i].waiting;
        total_tat += p[i].turnaround;
    }
    printf("\nAverage Waiting Time    : %.2f\n", total_wt  / n);
    printf("Average Turnaround Time : %.2f\n",  total_tat / n);

    writeResults();
    printf("\nResults also sent to the UI.\n");
    return 0;
}
