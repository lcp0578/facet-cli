/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/nopt/nopt.d.ts" />
/// <reference path="../typings/q/Q.d.ts" />
/// <reference path="../node_modules/facetjs/build/facet.d.ts" />
/// <reference path="../node_modules/facetjs-druid-requester/build/facetjs-druid-requester.d.ts" />
"use strict";

import Q = require('q');
import nopt = require("nopt");
import chronology = require("chronology");
import facet = require("facetjs");
import $ = facet.$;
import Expression = facet.Expression;
import RefExpression = facet.RefExpression;
import ActionsExpression = facet.ActionsExpression;
import DefAction = facet.DefAction;
import Datum = facet.Datum;
import Dataset = facet.Dataset;
import DruidRequester = require('facetjs-druid-requester')
import druidRequesterFactory = DruidRequester.druidRequesterFactory;

var WallTime = chronology.WallTime;
if (!WallTime.rules) {
  var tzData = require("chronology/lib/walltime/walltime-data.js");
  WallTime.init(tzData.rules, tzData.zones);
}

var Duration = chronology.Duration;
var Timezone = chronology.Timezone;

function usage() {
  console.log(`
Usage: facet [options]

      --help         print this help message
      --version      display the version number
  -v, --verbose      display the queries that are being made
  -h, --host         the host to connect to
  -d, --data-source  use this data source for the query (supersedes FROM clause)
  -s, --sql          run this SQL query
  -o, --output       specify the output format. Possible values: json (default), csv

  -a, --allow        enable a behaviour that is turned off by default
          eternity     allow queries not filtered on time
          select       allow select queries
`
  )
}

function version() {
  console.log(`facet version 0.10.1 (cli version 0.1.0 / alpha)`);
}

function getDatasourceName(ex: Expression): string {
  var name: string = null;
  ex.some((ex) => {
    if (ex instanceof ActionsExpression) {
      var operand = ex.operand;
      var firstAction = ex.actions[0];
      if (operand instanceof RefExpression) {
        name = operand.name;
        return true;
      } else if (firstAction instanceof DefAction && firstAction.name === 'data') {
        var firstActionExpression = firstAction.expression;
        if (firstActionExpression instanceof RefExpression) {
          name = firstActionExpression.name;
          return true;
        }
      }
    }
    return null;
  });
  return name;
}

function parseArgs() {
  return nopt(
    {
      "host": String,
      "data-source": String,
      "help": Boolean,
      "sql": String,
      "interval": String,
      "version": Boolean,
      "verbose": Boolean,
      "output": String,
      "allow": [String, Array]
    },
    {
      "h": ["--host"],
      "s": ["--sql"],
      "v": ["--verbose"],
      "d": ["--data-source"],
      "i": ["--interval"],
      "a": ["--allow"],
      "o": ["--output"]
    },
    process.argv
  );
}

export function run() {
  var parsed = parseArgs();
  if (parsed.argv.original.length === 0 || parsed['help']) return usage();
  if (parsed['version']) return version();

  var sql: string = parsed['sql'];
  var expression: Expression = null;
  if (sql) {
    try {
      expression = Expression.parseSQL(sql)
    } catch (e) {
      console.log("Could not parse SQL");
      console.log(e.message);
      return;
    }
  } else {
    console.log("no query found please use --sql (-s) flag");
    return;
  }

  var dataSource = getDatasourceName(expression);
  if (!dataSource) {
    console.log("must have data source");
    return;
  }

  var host: string = parsed['host'];
  if (!host) {
    console.log("must have host for now");
    return;
  }

  var druidRequester = druidRequesterFactory({
    host: host,
    timeout: 30000
  });

  var requester: Requester.FacetRequester<any>;
  if (parsed['verbose']) {
    requester = (request: Requester.DatabaseRequest<any>): Q.Promise<any> => {
      console.log("vvvvvvvvvvvvvvvvvvvvvvvvvv");
      console.log("Sending query:", JSON.stringify(request.query, null, 2));
      console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^");
      return druidRequester(request)
        .then((data) => {
          console.log("vvvvvvvvvvvvvvvvvvvvvvvvvv");
          console.log("Got result:", JSON.stringify(data, null, 2));
          console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^");
          return data;
        });
    }
  } else {
    requester = druidRequester;
  }

  var filter: Expression = null;
  if (parsed['interval']) {
    try {
      var interval = Duration.fromJS(parsed['interval']);
    } catch (e) {
      console.log("Could not parse interval", parsed['interval']);
      console.log(e.message);
      return;
    }

    var now = new Date();
    filter = $('__time').in({ start: interval.move(now, Timezone.UTC(), -1), end: now })
  }

  var dataset = Dataset.fromJS({
    source: 'druid',
    dataSource: dataSource,
    timeAttribute: '__time',
    forceInterval: true,
    approximate: true,
    filter: filter,
    requester: requester
  });

  var context: Datum = {};
  context[dataSource] = dataset;

  expression.compute(context)
    .then(
      (data: any) => {
        console.log(JSON.stringify(data, null, 2));
      },
      (err: Error) => {
        console.log("There was an error getting the data:", err.message);
      }
    ).done()
}
