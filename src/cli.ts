/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/nopt/nopt.d.ts" />
/// <reference path="../node_modules/facetjs/build/facet.d.ts" />
"use strict";

import nopt = require("nopt");
import facet = require("facetjs");

var Expression = facet.core.Expression;

export function usage() {
  console.log(`
Usage: facet [options]

      --help        print this help message
  -v, --version      display the version number
  -h, --host        the host to connect to
  -s, --sql         run this SQL query
      --simulate    simulate this query
  `)
}

export function version() {
  console.log(`facet version 0.9.12 (cli version 0.1.0)`);
}

export function run() {
  var parsed = nopt(
    {
      "host": String,
      "help": Boolean,
      "sql": String,
      "simulate": Boolean,
      "version": Boolean
    },
    {
      "h": ["--host"],
      "s": ["--sql"],
      "v": ["--version"]
    },
    process.argv,
    2
  );

  if (parsed.argv.original.length === 0 || parsed['help']) return usage();

  if (parsed['version']) return version();

  var sql: string = parsed['sql'];
  if (sql) {
    console.log(Expression.parseSQL(sql).toJS());
  }
}
