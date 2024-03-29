/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/nopt/nopt.d.ts" />
/// <reference path="../node_modules/facetjs/build/facetjs.d.ts" />
/// <reference path="../node_modules/facetjs-druid-requester/build/facetjs-druid-requester.d.ts" />
"use strict";

import fs = require('fs');
import path = require("path");
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
import NativeDataset = facet.NativeDataset;

import DruidRequester = require('facetjs-druid-requester')
import druidRequesterFactory = DruidRequester.druidRequesterFactory;

var WallTime = chronology.WallTime;
if (!WallTime.rules) {
  var tzData = require("chronology/lib/walltime/walltime-data.js");
  WallTime.init(tzData.rules, tzData.zones);
}

var Timezone = chronology.Timezone;
var TimeRange = chronology.TimeRange;

function usage() {
  console.log(`
Usage: facet [options]

Example: facet -h 10.20.30.40 -q "SELECT MAX(__time) AS maxTime FROM twitterstream"

       --help         print this help message
       --version      display the version number
  -v,  --verbose      display the queries that are being made
  -h,  --host         the host to connect to
  -d,  --data-source  use this data source for the query (supersedes FROM clause)
  -i,  --interval     add (AND) a __time filter between NOW-INTERVAL and NOW
  -q,  --query        the query to run
  -o,  --output       the output format. Possible values: json (default), csv, tsv, flat
  -r,  --retry        the number of tries a query should be attempted on error, 0 = unlimited, (default: 2)
  -c,  --concurrent   the limit of concurrent queries that could be made simultaneously, 0 = unlimited, (default: 2)

  -fu, --force-unique     force a column to be interpreted as a hyperLogLog uniques
  -fh, --force-histogram  force a column to be interpreted as an approximate histogram

  -a,  --allow        enable a behaviour that is turned off by default
           eternity     allow queries not filtered on time
           select       allow select queries
`
  )
}

function version(): void {
  var cliPackageFilename = path.join(__dirname, '..', 'package.json');
  try {
    var cliPackage = JSON.parse(fs.readFileSync(cliPackageFilename, 'utf8'));
  } catch (e) {
    console.log("could not read cli package", e.message);
    return;
  }
  console.log(`facet-cli version ${cliPackage.version} [beta] (facetjs version ${facet.version})`);
}

function getDatasourceName(ex: Expression): string {
  var name: string = null;
  ex.some(ex => {
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
      "query": String,
      "interval": String,
      "version": Boolean,
      "verbose": Boolean,
      "retry": Number,
      "concurrent": Number,
      "output": String,
      "allow": [String, Array],
      "force-unique": [String, Array],
      "force-histogram": [String, Array]
    },
    {
      "h": ["--host"],
      "q": ["--query"],
      "v": ["--verbose"],
      "d": ["--data-source"],
      "i": ["--interval"],
      "a": ["--allow"],
      "r": ["--retry"],
      "c": ["--concurrent"],
      "o": ["--output"],
      "fu": ["--force-unique"],
      "fh": ["--force-histogram"]
    },
    process.argv
  );
}

export function run() {
  var parsed = parseArgs();
  if (parsed.argv.original.length === 0 || parsed['help']) return usage();
  if (parsed['version']) return version();
  var verbose: boolean = parsed['verbose'];

  // Get allow
  var allows: string[] = parsed['allow'] || [];
  for (let allow of allows) {
    if (!(allow === 'eternity' || allow === 'select')) {
      console.log("Unexpected allow", allow);
      return;
    }
  }

  // Get forced attribute overrides
  var attributeOverrides: facet.AttributeJSs = {};
  var forceUnique: string[] = parsed['force-unique'] || [];
  for (let attributeName of forceUnique) {
    attributeOverrides[attributeName] = { special: 'unique' };
  }
  var forceHistogram: string[] = parsed['force-histogram'] || [];
  for (let attributeName of forceHistogram) {
    attributeOverrides[attributeName] = { special: 'histogram' };
  }

  // Get output
  var output: string = (parsed['output'] || 'json').toLowerCase();
  if (output !== 'json' && output !== 'csv' && output !== 'tsv' && output !== 'flat') {
    console.log(`output must be one of json, csv, tsv, or flat (is ${output}})`);
    return;
  }

  // Get host
  var host: string = parsed['host'];
  if (!host) {
    console.log("must have host (for now)");
    return;
  }

  // Get SQL
  var query: string = parsed['query'];
  var expression: Expression = null;
  if (query) {
    query = query.trim();
    if (/^SELECT/i.test(query)) {
      try {
        expression = Expression.parseSQL(query);
      } catch (e) {
        console.log("Could not parse query as SQL:", e.message);
        return;
      }

    } else if (query[0] === '$') {
      try {
        expression = Expression.parse(query);
      } catch (e) {
        console.log("Could not parse query as facet:", e.message);
        return;
      }

    } else if (query[0] === '{') {
      try {
        expression = Expression.fromJS(JSON.parse(query));
      } catch (e) {
        console.log("Could not parse query as facet:", e.message);
        return;
      }

    } else {
      console.log("Could not determine query type (query should start with 'SELECT', '$', or '{')");
      return;
    }
  } else {
    console.log("no query found please use --query (-q) flag");
    return;
  }

  if (verbose) {
    console.log('Parsed query as the following facet expression (as JSON):');
    console.log(JSON.stringify(expression, null, 2));
    console.log('---------------------------');
  }

  var dataSource = getDatasourceName(expression);
  if (!dataSource) {
    console.log("must have data source");
    return;
  }

  var requester: Requester.FacetRequester<any>;
  requester = druidRequesterFactory({
    host: host,
    timeout: 30000
  });

  var retry: number = parsed.hasOwnProperty('retry') ? parsed['retry'] : 2;
  if (retry > 0) {
    requester = facet.Helper.retryRequesterFactory({
      requester: requester,
      retry: retry,
      delay: 500,
      retryOnTimeout: false
    });
  }

  if (verbose) {
    requester = facet.Helper.verboseRequesterFactory({
      requester: requester
    });
  }

  var concurrent: number = parsed.hasOwnProperty('concurrent') ? parsed['concurrent'] : 2;
  if (concurrent > 0) {
    requester = facet.Helper.concurrentLimitRequesterFactory({
      requester: requester,
      concurrentLimit: concurrent
    });
  }

  var timeAttribute = '__time';

  var filter: Expression = null;
  var intervalString: string = parsed['interval'];
  if (intervalString) {
    try {
      var interval = TimeRange.fromString(intervalString);
    } catch (e) {
      console.log("Could not parse interval", intervalString);
      console.log(e.message);
      return;
    }

    let [start, end] = interval.evaluate(Timezone.UTC);
    filter = $(timeAttribute).in({ start, end });
  }

  var dataset = Dataset.fromJS({
    source: 'druid',
    dataSource,
    timeAttribute,
    allowEternity: allows.indexOf('eternity') !== -1,
    allowSelectQueries: allows.indexOf('select') !== -1,
    filter,
    requester,
    attributeOverrides
  });

  var context: Datum = {};
  context[dataSource] = dataset;

  expression.compute(context)
    .then(
      (data: NativeDataset) => {
        var outputStr: string;
        switch (output) {
          case 'json':
            outputStr = JSON.stringify(data, null, 2);
            break;

          case 'csv':
            outputStr = data.toCSV();
            break;

          case 'tsv':
            outputStr = data.toTSV();
            break;

          case 'flat':
            outputStr = JSON.stringify(data.flatten().data, null, 2);
            break;

          default:
            outputStr = 'Unknown output type';
            break;
        }
        console.log(outputStr);
      },
      (err: Error) => {
        console.log(`There was an error getting the data: ${err.message}`);
      }
    ).done()
}
