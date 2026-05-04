import { createInterface } from 'readline/promises';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const MAX = 10;
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  let n = 0;
  while (n < 1 || n > MAX) {
    const raw = await rl.question(`Enter number of processes (max ${MAX}): `);
    n = parseInt(raw);
    if (isNaN(n) || n < 1 || n > MAX)
      console.log(`  Enter a number between 1 and ${MAX}.`);
  }

  const processes = [];
  for (let i = 0; i < n; i++) {
    console.log(`\nProcess P${i + 1}:`);
    const arrival  = parseInt(await rl.question('  Arrival time  : ')) || 0;
    const burst    = parseInt(await rl.question('  Burst time    : ')) || 0;
    const io       = parseInt(await rl.question('  I/O bursts    : ')) || 0;
    const priority = parseInt(await rl.question('  Priority      : ')) || 1;
    processes.push({ pid: `P${i + 1}`, arrivalTime: arrival, cpuBursts: burst, ioBursts: io, priority });
  }

  console.log('\nAlgorithms: FCFS | SRJF | Round Robin | Priority (Preemptive)');
  const algorithm = await rl.question('Enter algorithm: ');

  let timeQuantum = 2;
  if (algorithm.trim() === 'Round Robin') {
    const q = parseInt(await rl.question('Time quantum  : '));
    if (!isNaN(q) && q > 0) timeQuantum = q;
  }

  rl.close();

  const __dirname = dirname(fileURLToPath(import.meta.url));
  mkdirSync(resolve(__dirname, 'public'), { recursive: true });
  writeFileSync(
    resolve(__dirname, 'public', 'input.json'),
    JSON.stringify({ timestamp: Date.now(), algorithm, timeQuantum, processes }, null, 2)
  );

  console.log(`\nDone. ${processes.length} process(es) sent to the UI.`);
}

main();
