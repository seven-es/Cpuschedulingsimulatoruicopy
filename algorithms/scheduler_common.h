#ifndef SCHEDULER_COMMON_H
#define SCHEDULER_COMMON_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "workload.h"

/* ── Limits ──────────────────────────────────────────────────────────────── */
#define MAX_PROCS  WL_MAX
#define MAX_GANTT  10000
#define MAX_BURSTS WL_MAX_BURSTS

/* ── Process state ───────────────────────────────────────────────────────── */
typedef enum {
    STATE_NEW = 0,
    STATE_READY,
    STATE_RUNNING,
    STATE_WAITING,
    STATE_TERMINATED
} ProcState;

/* ── Core structs ────────────────────────────────────────────────────────── */
typedef struct {
    char      pid[WL_PID_LEN];
    int       arrival;
    int       priority;
    int       cpu_bursts[MAX_BURSTS];
    int       io_bursts[MAX_BURSTS];
    int       cpu_count;
    int       io_count;
    int       current_cpu;
    int       current_io;
    int       cpu_remaining;
    ProcState state;
    int       response;
    int       started;
    int       finish_time;
    int       turnaround;
} Process;

typedef struct {
    char pid[WL_PID_LEN];
    int  start;
    int  end;
} Gantt;

/* Circular-ish queue (sized for worst-case RR requeueing) */
typedef struct {
    int data[MAX_PROCS * 500];
    int front;
    int rear;
} Queue;

/* ── Queue operations ────────────────────────────────────────────────────── */
static void queue_init(Queue *q)       { q->front = q->rear = 0; }
static int  queue_empty(Queue *q)      { return q->front == q->rear; }
static void enqueue(Queue *q, int v)   { q->data[q->rear++] = v; }
static int  dequeue(Queue *q)          { return q->data[q->front++]; }

/* ── Simulation helpers ──────────────────────────────────────────────────── */

static void init_processes(Process *p, int n, int *io_complete_time) {
    for (int i = 0; i < n; i++) {
        p[i].state        = STATE_NEW;
        p[i].cpu_remaining = p[i].cpu_bursts[0];
        p[i].current_cpu  = 0;
        p[i].current_io   = 0;
        p[i].response     = -1;
        p[i].started      = 0;
        p[i].finish_time  = 0;
        p[i].turnaround   = 0;
        io_complete_time[i] = -1;
    }
}

/* Called when IO finishes for process i — move back to READY. */
static void finish_io(Process *p, int i, int *io_complete_time) {
    p[i].cpu_remaining  = p[i].cpu_bursts[p[i].current_cpu];
    p[i].state          = STATE_READY;
    io_complete_time[i] = -1;
}

/* Called when the current CPU burst of 'running' ends at time finish_t. */
static void complete_cpu_burst(Process *p, int running, int finish_t,
                                int *io_complete_time, int *completed) {
    p[running].current_cpu++;

    if (p[running].current_cpu < p[running].cpu_count) {
        /* More CPU bursts remain — go to IO. */
        p[running].state          = STATE_WAITING;
        io_complete_time[running] = (finish_t - 1)
                                  + p[running].io_bursts[p[running].current_io];
        p[running].current_io++;
    } else {
        /* All CPU bursts done — terminate. */
        p[running].state       = STATE_TERMINATED;
        p[running].finish_time = finish_t;
        p[running].turnaround  = finish_t - p[running].arrival;
        (*completed)++;
    }
}

/* Append a tick to the Gantt chart, merging consecutive same-PID blocks. */
static void add_gantt(Gantt *gantt, int *count, const char *pid, int t) {
    if (*count > 0
        && strcmp(gantt[*count - 1].pid, pid) == 0
        && gantt[*count - 1].end == t) {
        gantt[*count - 1].end = t + 1;
    } else {
        strncpy(gantt[*count].pid, pid, WL_PID_LEN - 1);
        gantt[*count].pid[WL_PID_LEN - 1] = '\0';
        gantt[*count].start = t;
        gantt[*count].end   = t + 1;
        (*count)++;
    }
}

/* ── Workload loading ────────────────────────────────────────────────────── */

/*
 * Load a specific workload file into a Process array.
 * Sets *n to the number of processes loaded.
 * Returns the count, or -1 if the file could not be opened.
 * Also reads any "quantum=N" directive into wl_quantum.
 */
static int load_workload_from(Process *p, int *n, const char *filename) {
    FILE *fp = fopen(filename, "r");
    if (!fp) {
        printf("Error: cannot open workload file '%s'\n", filename);
        return -1;
    }

    int is_new = detect_new_format(fp);
    int count  = 0;
    char line[512];

    while (fgets(line, sizeof(line), fp) && count < MAX_PROCS) {
        char *s = line;
        while (*s == ' ' || *s == '\t') s++;
        if (*s == '\0' || *s == '\n' || *s == '\r') continue;

        if (*s == '#') {
            char *q = strstr(s, "quantum=");
            if (q) wl_quantum = atoi(q + 8);
            continue;
        }
        if (strncmp(s, "quantum=", 8) == 0) {
            wl_quantum = atoi(s + 8);
            continue;
        }

        char pid[WL_PID_LEN] = "";
        int  arrival = 0, priority = 0;
        char cpu_str[64] = "", io_str[64] = "-";
        int  num_cpu = 0, num_io = 0;
        int  cpu_arr[MAX_BURSTS], io_arr[MAX_BURSTS];

        if (is_new) {
            int parsed = sscanf(s, "%19s %d %d %63s %63s",
                                pid, &arrival, &priority, cpu_str, io_str);
            if (parsed < 4) continue;
            num_cpu = parse_burst_array(cpu_str, cpu_arr, MAX_BURSTS);
            num_io  = (parsed >= 5)
                      ? parse_burst_array(io_str, io_arr, MAX_BURSTS)
                      : 0;
        } else {
            int burst = 0;
            int parsed = sscanf(s, "%19s %d %d %d", pid, &arrival, &burst, &priority);
            if (parsed < 3) continue;
            cpu_arr[0] = burst; num_cpu = 1;
            priority   = (parsed >= 4) ? priority : 0;
            num_io     = 0;
        }

        if (num_cpu == 0) continue;
        if (num_cpu != num_io + 1) {
            printf("Skipping %s: CPU burst count must be IO burst count + 1\n", pid);
            continue;
        }

        Process *pr = &p[count];
        strncpy(pr->pid, pid, WL_PID_LEN - 1);
        pr->pid[WL_PID_LEN - 1] = '\0';
        pr->arrival      = arrival;
        pr->priority     = priority;
        pr->cpu_count    = num_cpu;
        pr->io_count     = num_io;
        for (int j = 0; j < num_cpu; j++) pr->cpu_bursts[j] = cpu_arr[j];
        for (int j = 0; j < num_io;  j++) pr->io_bursts[j]  = io_arr[j];
        pr->cpu_remaining = cpu_arr[0];
        pr->current_cpu   = 0;
        pr->current_io    = 0;
        pr->state         = STATE_NEW;
        pr->response      = -1;
        pr->started       = 0;
        pr->finish_time   = 0;
        pr->turnaround    = 0;
        count++;
    }

    fclose(fp);
    *n = count;
    return count;
}

/* ── CSV output ──────────────────────────────────────────────────────────── */

static void write_result_files(const char *algo, Process *p, int n,
                                Gantt *gantt, int gantt_count, int cpu_busy) {
    /* Derive total simulation time from latest finish. */
    int total_time = 0;
    for (int i = 0; i < n; i++) {
        if (p[i].finish_time > total_time)
            total_time = p[i].finish_time;
    }

    /* Count context switches from Gantt (every non-IDLE dispatch). */
    int cs = 0;
    for (int i = 0; i < gantt_count; i++) {
        if (strcmp(gantt[i].pid, "IDLE") != 0) cs++;
    }
    if (cs > 0) cs--;   /* first dispatch is not a "switch" */

    /* Per-process stats: waiting = turnaround - sum(cpu) - sum(io). */
    double sum_wait = 0, sum_turn = 0, sum_resp = 0;
    for (int i = 0; i < n; i++) {
        int cpu_total = 0, io_total = 0;
        for (int j = 0; j < p[i].cpu_count; j++) cpu_total += p[i].cpu_bursts[j];
        for (int j = 0; j < p[i].io_count;  j++) io_total  += p[i].io_bursts[j];
        int waiting = p[i].turnaround - cpu_total - io_total;
        sum_wait += waiting;
        sum_turn += p[i].turnaround;
        sum_resp += p[i].response;
    }

    char fname[128];

    /* Gantt chart CSV */
    snprintf(fname, sizeof(fname), "%s_gantt_chart.csv", algo);
    FILE *fg = fopen(fname, "w");
    if (fg) {
        fprintf(fg, "PID,Start,End\n");
        for (int i = 0; i < gantt_count; i++) {
            fprintf(fg, "%s,%d,%d\n", gantt[i].pid, gantt[i].start, gantt[i].end);
        }
        fclose(fg);
    }

    /* Process stats CSV */
    snprintf(fname, sizeof(fname), "%s_process_stats.csv", algo);
    FILE *fs = fopen(fname, "w");
    if (fs) {
        fprintf(fs, "PID,Arrival,Priority,CPUBurst,IOBurst,Waiting,Turnaround,Response,Finish\n");
        for (int i = 0; i < n; i++) {
            int cpu_total = 0, io_total = 0;
            for (int j = 0; j < p[i].cpu_count; j++) cpu_total += p[i].cpu_bursts[j];
            for (int j = 0; j < p[i].io_count;  j++) io_total  += p[i].io_bursts[j];
            int waiting = p[i].turnaround - cpu_total - io_total;
            fprintf(fs, "%s,%d,%d,%d,%d,%d,%d,%d,%d\n",
                    p[i].pid, p[i].arrival, p[i].priority,
                    cpu_total, io_total,
                    waiting, p[i].turnaround, p[i].response, p[i].finish_time);
        }
        fclose(fs);
    }

    /* Summary CSV */
    snprintf(fname, sizeof(fname), "%s_summary.csv", algo);
    FILE *fm = fopen(fname, "w");
    if (fm) {
        double util = total_time > 0 ? (100.0 * cpu_busy / total_time) : 0.0;
        double tput = total_time > 0 ? ((double)n / total_time) : 0.0;
        fprintf(fm, "Metric,Value\n");
        fprintf(fm, "Average Waiting Time,%.2f\n",    sum_wait / n);
        fprintf(fm, "Average Turnaround Time,%.2f\n", sum_turn / n);
        fprintf(fm, "Average Response Time,%.2f\n",   sum_resp / n);
        fprintf(fm, "CPU Utilization,%.2f\n",         util);
        fprintf(fm, "Throughput,%.2f\n",              tput);
        fprintf(fm, "Context Switches,%d\n",          cs);
        fprintf(fm, "Total Time,%d\n",                total_time);
        fprintf(fm, "CPU Busy Time,%d\n",             cpu_busy);
        fclose(fm);
    }
}

#endif /* SCHEDULER_COMMON_H */
