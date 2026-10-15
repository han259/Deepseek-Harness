#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { HELP_TEXT, TaskLensError, loadTasks, parseArgs, renderReport } from './tasks.js';

/**
 * Run Task Lens. Returns the process exit code instead of calling process.exit,
 * so the same entry point is usable from tests.
 */
export async function main(
  argv = process.argv.slice(2),
  { stdout = process.stdout, stderr = process.stderr } = {},
) {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }

    const tasks = await loadTasks(options.file);
    stdout.write(`${renderReport(tasks, { status: options.status })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof TaskLensError) {
      stderr.write(`task-lens: ${error.message}\n`);
      return 1;
    }

    stderr.write(`task-lens: unexpected error: ${error?.stack ?? String(error)}\n`);
    return 1;
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exitCode = await main();
}
