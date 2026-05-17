#!/usr/bin/env bun
import { Command } from 'commander';

const program = new Command();
program.name('signal').description('Multi-provider AI usage monitor').version('0.1.0');
program
  .command('status')
  .description('One-shot usage table')
  .action(() => {
    console.log('status: not yet implemented');
  });
program.parse();
