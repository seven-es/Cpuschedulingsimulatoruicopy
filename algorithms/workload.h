#ifndef WORKLOAD_H
#define WORKLOAD_H

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define WL_MAX        50
#define WL_PID_LEN    20
#define WL_MAX_BURSTS 10

/*
 * WorkloadEntry - stores raw process data from workload.txt
 * Supports both:
 *   Old format: PID  Arrival  Burst  Priority   (4 columns)
 *   New format: PID  Arrival  Priority  CPU_BURSTS  IO_BURSTS  (5 columns)
 *
 * New format examples:
 *   P1 0 2 (5,3) 4        -> cpu=[5,3]  io=[4]
 *   P2 1 1 4 -             -> cpu=[4]    io=[]
 *   P3 2 3 (2,4,3) (3,2)  -> cpu=[2,4,3] io=[3,2]
 *   P4 4 2 6 -             -> cpu=[6]    io=[]
 */
typedef struct {
    char pid[WL_PID_LEN];
    int  arrival;
    int  priority;
    int  cpu_bursts[WL_MAX_BURSTS];
    int  num_cpu;
    int  io_bursts[WL_MAX_BURSTS];
    int  num_io;
} WorkloadEntry;

/* Round-Robin quantum — overridden by "quantum=N" line in workload.txt */
static int wl_quantum = 2;

/* ── Internal helpers ────────────────────────────────────────────────────── */

/*
 * Parse a burst field into an integer array.
 * "8"       -> arr={8},    return 1
 * "(5,3)"   -> arr={5,3},  return 2
 * "(2,4,3)" -> arr={2,4,3}, return 3
 * "-" or "" -> return 0
 */
static int parse_burst_array(const char *s, int *arr, int maxn) {
    if (!s || !*s || s[0] == '-') return 0;
    int n = 0;
    const char *p = (s[0] == '(') ? s + 1 : s;
    while (*p && *p != ')' && n < maxn) {
        int v = atoi(p);
        arr[n++] = v;
        while (*p && *p != ',' && *p != ')') p++;
        if (*p == ',') p++;
    }
    return n;
}

/*
 * Scan the file to detect format:
 *   new format if any data line has '(' OR 5+ tokens, or header says CPU_BURSTS/IO_BURSTS
 *   old format otherwise
 * File position is restored after detection.
 */
static int detect_new_format(FILE *fp) {
    long pos = ftell(fp);
    char line[512];
    int is_new = 0;

    while (!is_new && fgets(line, sizeof(line), fp)) {
        char *s = line;
        while (*s == ' ' || *s == '\t') s++;
        if (*s == '\0' || *s == '\n' || *s == '\r') continue;

        if (*s == '#') {
            if (strstr(s, "CPU_BURSTS") || strstr(s, "IO_BURSTS"))
                is_new = 1;
            continue;
        }

        /* First data line */
        if (strchr(line, '(')) { is_new = 1; break; }

        char tmp[512];
        strncpy(tmp, line, 511); tmp[511] = '\0';
        int cnt = 0;
        char *tok = strtok(tmp, " \t\r\n");
        while (tok) { cnt++; tok = strtok(NULL, " \t\r\n"); }
        if (cnt >= 5) is_new = 1;
        break;
    }

    fseek(fp, pos, SEEK_SET);
    return is_new;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/*
 * Deep-copy n entries from src into dst.
 *
 * WorkloadEntry contains only fixed-size arrays (no heap pointers), so a
 * field-by-field struct copy IS a true deep copy.  Call this before passing
 * the workload to each algorithm so every algorithm starts with a pristine,
 * unmodified copy — critical when comparing algorithms on the same workload.
 *
 * Usage (single-program multi-algorithm design):
 *   WorkloadEntry original[WL_MAX], copy[WL_MAX];
 *   int n = find_and_load_workload(original, WL_MAX);
 *
 *   wl_copy_entries(copy, original, n);
 *   run_fcfs(copy, n);
 *
 *   wl_copy_entries(copy, original, n);   // restore before next algorithm
 *   run_rr(copy, n);
 */
static void wl_copy_entries(WorkloadEntry *dst, const WorkloadEntry *src, int n) {
    for (int i = 0; i < n; i++) dst[i] = src[i];
}

/*
 * Find workload.txt in common locations and load all processes.
 * Returns number of entries loaded, or -1 if file not found.
 * Also sets wl_quantum from any "quantum=N" directive.
 */
static int find_and_load_workload(WorkloadEntry *wl, int maxn) {
    const char *paths[] = {
        "workload.txt", "../workload.txt", "../../workload.txt", NULL
    };
    FILE *fp = NULL;
    int pi = 0;
    while (paths[pi] && !fp) fp = fopen(paths[pi++], "r");
    if (!fp) return -1;

    int new_fmt = detect_new_format(fp);
    int n = 0;
    char line[512];

    while (fgets(line, sizeof(line), fp) && n < maxn) {
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

        if (new_fmt) {
            /* New: PID Arrival Priority CPU_BURSTS IO_BURSTS */
            int arrival = 0, priority = 0;
            char cpu_str[64] = "", io_str[64] = "-";
            int parsed = sscanf(s, "%19s %d %d %63s %63s",
                                 pid, &arrival, &priority, cpu_str, io_str);
            if (parsed >= 4) {
                strncpy(wl[n].pid, pid, WL_PID_LEN - 1);
                wl[n].pid[WL_PID_LEN - 1] = '\0';
                wl[n].arrival  = arrival;
                wl[n].priority = priority;
                wl[n].num_cpu  = parse_burst_array(cpu_str, wl[n].cpu_bursts, WL_MAX_BURSTS);
                wl[n].num_io   = (parsed >= 5)
                                 ? parse_burst_array(io_str, wl[n].io_bursts, WL_MAX_BURSTS)
                                 : 0;
                if (wl[n].num_cpu > 0 && wl[n].num_cpu == wl[n].num_io + 1) n++;
            }
        } else {
            /* Old: PID Arrival Burst Priority */
            int arrival = 0, burst = 0, priority = 0;
            int parsed = sscanf(s, "%19s %d %d %d", pid, &arrival, &burst, &priority);
            if (parsed >= 3) {
                strncpy(wl[n].pid, pid, WL_PID_LEN - 1);
                wl[n].pid[WL_PID_LEN - 1] = '\0';
                wl[n].arrival      = arrival;
                wl[n].priority     = (parsed >= 4) ? priority : 0;
                wl[n].cpu_bursts[0] = burst;
                wl[n].num_cpu      = 1;
                wl[n].num_io       = 0;
                n++;
            }
        }
    }
    fclose(fp);
    return n;
}

#endif /* WORKLOAD_H */
