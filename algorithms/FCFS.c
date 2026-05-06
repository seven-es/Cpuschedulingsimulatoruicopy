#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_PROCESSES 100
#define MAX_PID_LEN 20
#define MAX_BURSTS 20
#define MAX_GANTT 1000
#define MAX_QUEUE 1000

typedef enum {
    NEW,
    READY,
    RUNNING,
    WAITING,
    TERMINATED
} State;

typedef struct {
    char pid[MAX_PID_LEN];
    int arrival;
    int priority;

    int cpu_bursts[MAX_BURSTS];
    int io_bursts[MAX_BURSTS];
    int cpu_count;
    int io_count;

    int current_cpu;
    int current_io;

    State state;

    int start_time;
    int finish_time;
    int waiting_time;
    int turnaround_time;
    int response_time;
    int has_started;
} Process;

typedef struct {
    char pid[MAX_PID_LEN];
    int start;
    int end;
} GanttEntry;

typedef struct {
    int data[MAX_QUEUE];
    int front;
    int rear;
} Queue;

typedef struct {
    Process processes[MAX_PROCESSES];
    int process_count;

    GanttEntry gantt[MAX_GANTT];
    int gantt_count;

    double avg_waiting;
    double avg_turnaround;
    double avg_response;
    double cpu_utilization;
    double throughput;

    int context_switches;
    int total_time;
    int cpu_busy_time;
} FCFSResult;

static void init_queue(Queue *q) {
    q->front = 0;
    q->rear = 0;
}

static int is_empty(Queue *q) {
    return q->front == q->rear;
}

static void enqueue(Queue *q, int value) {
    if (q->rear < MAX_QUEUE) {
        q->data[q->rear++] = value;
    }
}

static int dequeue(Queue *q) {
    if (is_empty(q)) return -1;
    return q->data[q->front++];
}

static void trim_newline(char *s) {
    int len = (int)strlen(s);
    if (len > 0 && s[len - 1] == '\n') {
        s[len - 1] = '\0';
    }
}

static int parse_burst_list(const char *token, int arr[]) {
    if (strcmp(token, "-") == 0) {
        return 0;
    }

    int count = 0;
    char buffer[256];
    int j = 0;

    for (int i = 0; token[i] != '\0'; i++) {
        if (token[i] != '(' && token[i] != ')' && token[i] != ' ') {
            buffer[j++] = token[i];
        }
    }
    buffer[j] = '\0';

    char *part = strtok(buffer, ",");
    while (part != NULL && count < MAX_BURSTS) {
        arr[count++] = atoi(part);
        part = strtok(NULL, ",");
    }

    return count;
}

static int read_workload(const char *filename, Process processes[]) {
    FILE *file = fopen(filename, "r");
    if (file == NULL) {
        printf("Error: cannot open file %s\n", filename);
        return 0;
    }

    char line[256];
    int count = 0;

    while (fgets(line, sizeof(line), file) != NULL) {
        trim_newline(line);

        if (line[0] == '\0' || line[0] == '#') {
            continue;
        }

        char pid[MAX_PID_LEN];
        int arrival, priority;
        char cpu_token[128], io_token[128];

        int items = sscanf(line, "%19s %d %d %127s %127s",
                           pid, &arrival, &priority, cpu_token, io_token);

        if (items != 5) {
            printf("Skipping invalid line: %s\n", line);
            continue;
        }

        Process p;
        strcpy(p.pid, pid);
        p.arrival = arrival;
        p.priority = priority;

        p.cpu_count = parse_burst_list(cpu_token, p.cpu_bursts);
        p.io_count = parse_burst_list(io_token, p.io_bursts);

        p.current_cpu = 0;
        p.current_io = 0;
        p.state = NEW;

        p.start_time = -1;
        p.finish_time = 0;
        p.waiting_time = 0;
        p.turnaround_time = 0;
        p.response_time = 0;
        p.has_started = 0;

        if (p.cpu_count == 0) {
            printf("Skipping process %s: no CPU burst found\n", p.pid);
            continue;
        }

        if (p.cpu_count != p.io_count + 1) {
            printf("Skipping process %s: CPU bursts must be exactly one more than I/O bursts\n", p.pid);
            continue;
        }

        processes[count++] = p;

        if (count >= MAX_PROCESSES) break;
    }

    fclose(file);
    return count;
}

static int total_bursts(const int bursts[], int count) {
    int total = 0;
    for (int i = 0; i < count; i++) total += bursts[i];
    return total;
}

static FCFSResult fcfs(Process input[], int n) {
    FCFSResult result;

    result.process_count = n;
    result.gantt_count = 0;
    result.context_switches = 0;
    result.cpu_busy_time = 0;
    result.total_time = 0;

    for (int i = 0; i < n; i++) {
        result.processes[i] = input[i];
    }

    Queue ready_queue;
    init_queue(&ready_queue);

    int time = 0;
    int completed = 0;

    int running = -1;
    int cpu_end_time = -1;
    int previous_running = -1;

    int io_complete_time[MAX_PROCESSES];
    for (int i = 0; i < n; i++) {
        io_complete_time[i] = -1;
    }

    while (completed < n) {
        for (int i = 0; i < n; i++) {
            if (result.processes[i].state == NEW &&
                result.processes[i].arrival == time) {
                result.processes[i].state = READY;
                enqueue(&ready_queue, i);
            }
        }

        for (int i = 0; i < n; i++) {
            if (result.processes[i].state == WAITING &&
                io_complete_time[i] == time) {
                result.processes[i].state = READY;
                io_complete_time[i] = -1;
                enqueue(&ready_queue, i);
            }
        }

        if (running != -1 && cpu_end_time == time) {
            Process *p = &result.processes[running];

            p->current_cpu++;

            if (p->current_cpu < p->cpu_count) {
                p->state = WAITING;
                io_complete_time[running] =
                    (time - 1) + p->io_bursts[p->current_io];
                p->current_io++;
            } else {
                p->state = TERMINATED;
                p->finish_time = time;
                p->turnaround_time = time - p->arrival;
                completed++;
            }

            running = -1;
        }

        if (running == -1 && !is_empty(&ready_queue)) {
            int idx = dequeue(&ready_queue);
            Process *p = &result.processes[idx];

            p->state = RUNNING;

            if (!p->has_started) {
                p->start_time = time;
                p->response_time = time - p->arrival;
                p->has_started = 1;
            }

            int burst = p->cpu_bursts[p->current_cpu];
            cpu_end_time = time + burst;
            running = idx;

            strcpy(result.gantt[result.gantt_count].pid, p->pid);
            result.gantt[result.gantt_count].start = time;
            result.gantt[result.gantt_count].end = cpu_end_time;
            result.gantt_count++;

            result.cpu_busy_time += burst;

            if (previous_running != -1) {
                result.context_switches++;
            }
            previous_running = idx;
        }

        for (int i = ready_queue.front; i < ready_queue.rear; i++) {
            int idx = ready_queue.data[i];
            result.processes[idx].waiting_time++;
        }

        if (completed == n) {
            result.total_time = time;
            break;
        }

        time++;
    }

    double sum_waiting = 0, sum_turnaround = 0, sum_response = 0;

    for (int i = 0; i < n; i++) {
        sum_waiting += result.processes[i].waiting_time;
        sum_turnaround += result.processes[i].turnaround_time;
        sum_response += result.processes[i].response_time;
    }

    result.avg_waiting = sum_waiting / n;
    result.avg_turnaround = sum_turnaround / n;
    result.avg_response = sum_response / n;

    result.cpu_utilization =
        result.total_time > 0 ? ((double)result.cpu_busy_time / result.total_time) * 100.0 : 0.0;

    result.throughput = result.total_time > 0 ? (double)n / result.total_time : 0.0;

    return result;
}

static void write_gantt_csv(FCFSResult result, const char *filename) {
    FILE *file = fopen(filename, "w");
    if (!file) return;

    fprintf(file, "PID,Start,End\n");
    for (int i = 0; i < result.gantt_count; i++) {
        fprintf(file, "%s,%d,%d\n",
                result.gantt[i].pid,
                result.gantt[i].start,
                result.gantt[i].end);
    }

    fclose(file);
}

static void write_process_stats_csv(FCFSResult result, const char *filename) {
    FILE *file = fopen(filename, "w");
    if (!file) return;

    fprintf(file, "PID,Arrival,Priority,Burst,IOBurst,Waiting,Turnaround,Response,Finish\n");

    for (int i = 0; i < result.process_count; i++) {
        Process p = result.processes[i];
        fprintf(file, "%s,%d,%d,%d,%d,%d,%d,%d,%d\n",
                p.pid, p.arrival, p.priority,
                total_bursts(p.cpu_bursts, p.cpu_count),
                total_bursts(p.io_bursts, p.io_count),
                p.waiting_time, p.turnaround_time,
                p.response_time, p.finish_time);
    }

    fclose(file);
}

static void write_summary_csv(FCFSResult result, const char *filename) {
    FILE *file = fopen(filename, "w");
    if (!file) return;

    fprintf(file, "Metric,Value\n");
    fprintf(file, "Average Waiting Time,%.2f\n", result.avg_waiting);
    fprintf(file, "Average Turnaround Time,%.2f\n", result.avg_turnaround);
    fprintf(file, "Average Response Time,%.2f\n", result.avg_response);
    fprintf(file, "CPU Utilization,%.2f\n", result.cpu_utilization);
    fprintf(file, "Throughput,%.2f\n", result.throughput);
    fprintf(file, "Context Switches,%d\n", result.context_switches);
    fprintf(file, "Total Time,%d\n", result.total_time);
    fprintf(file, "CPU Busy Time,%d\n", result.cpu_busy_time);

    fclose(file);
}

int main(int argc, char *argv[]) {
    Process processes[MAX_PROCESSES];
    const char *workload = argc == 2 ? argv[1] : "FCFS_workload.txt";

    int count = read_workload(workload, processes);

    if (count == 0) {
        printf("No valid processes found.\n");
        return 1;
    }

    FCFSResult result = fcfs(processes, count);

    write_gantt_csv(result, "FCFS_gantt_chart.csv");
    write_process_stats_csv(result, "FCFS_process_stats.csv");
    write_summary_csv(result, "FCFS_summary.csv");

    printf("CSV files generated.\n");
    return 0;
}
