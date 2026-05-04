#include <stdio.h>
#include <string.h>
#include <time.h>

#define MAX 10

typedef struct {
    char pid[8];
    int  arrival;
    int  burst;
    int  completion;
    int  waiting;
    int  turnaround;
    int  response;
} Process;

typedef struct {
    char pid[8];
    int  start;
    int  end;
} Gantt;

Process p[MAX];
int     n;

Gantt gantt[MAX];
int   ganttCount = 0;
int   cpuBusy    = 0;

void fcfs() {
    int t = 0;

    for (int i = 0; i < n; i++) {
        if (t < p[i].arrival) t = p[i].arrival;

        strcpy(gantt[ganttCount].pid, p[i].pid);
        gantt[ganttCount].start = t;
        gantt[ganttCount].end   = t + p[i].burst;
        ganttCount++;

        p[i].response    = t - p[i].arrival;
        cpuBusy         += p[i].burst;
        t               += p[i].burst;
        p[i].completion  = t;
        p[i].turnaround  = t - p[i].arrival;
        p[i].waiting     = p[i].turnaround - p[i].burst;
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
    fprintf(fp, "  \"algorithm\": \"FCFS\",\n");

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
    }

    /* sort by arrival time */
    for (int i = 0; i < n - 1; i++)
        for (int j = i + 1; j < n; j++)
            if (p[j].arrival < p[i].arrival) {
                Process tmp = p[i]; p[i] = p[j]; p[j] = tmp;
            }

    fcfs();

    printf("\n=== Process Results ===\n");
    printf("%-6s %-10s %-8s %-12s %-12s %-10s\n",
           "PID", "Arrival", "Burst", "Completion", "Turnaround", "Waiting");
    printf("------------------------------------------------------------\n");
    float total_wt = 0, total_tat = 0;
    for (int i = 0; i < n; i++) {
        printf("%-6s %-10d %-8d %-12d %-12d %-10d\n",
               p[i].pid, p[i].arrival, p[i].burst,
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
