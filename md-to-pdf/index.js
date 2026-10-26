#!/usr/bin/env node
const { program } = require('./lib/cli');

// Browser lifecycle is managed by shared/browser-pool.js
// (SIGINT handler registered there)

program.parse();
