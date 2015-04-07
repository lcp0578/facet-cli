/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/nopt/nopt.d.ts" />
/// <reference path="../typings/q/Q.d.ts" />
/// <reference path="../node_modules/facetjs/build/facet.d.ts" />
/// <reference path="../node_modules/facetjs-druid-requester/build/facetjs-druid-requester.d.ts" />
"use strict";

import Q = require('q');
import nopt = require("nopt");
import facet = require("facetjs");
import DruidRequester = require('facetjs-druid-requester')
import druidRequesterFactory = DruidRequester.druidRequesterFactory;

var Expression = facet.core.Expression;
var Dataset = facet.core.Dataset;

export function usage() {
  console.log(`
Usage: facet [options]

       --help         print this help message
       --version      display the version number
  -v,  --verbose      display the queries that are being made
  -h,  --host         the host to connect to
  -ds, --data-source  the data source to query
  -s,  --sql          run this SQL query
       --simulate     simulate this query
`
  )
}

export function version() {
  console.log(`facet version 0.9.14 (cli version 0.1.0)`);
}

export function run() {
  var parsed = nopt(
    {
      "host": String,
      "data-source": String,
      "help": Boolean,
      "sql": String,
      "simulate": Boolean,
      "version": Boolean,
      "verbose": Boolean
    },
    {
      "h": ["--host"],
      "s": ["--sql"],
      "v": ["--verbose"],
      "ds": ["--data-source"]
    },
    process.argv
  );

  if (parsed.argv.original.length === 0 || parsed['help']) return usage();

  if (parsed['version']) return version();

  var sql: string = parsed['sql'];
  var expression: Core.Expression = null;
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

  var dataSource: string = parsed['data-source'];
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
          console.log("Got back:", JSON.stringify(data, null, 2));
          console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^");
          return data;
        });
    }
  } else {
    requester = druidRequester;
  }

  var context: Core.Datum = {
    data: Dataset.fromJS({
      source: 'druid',
      dataSource: dataSource,
      timeAttribute: '__time',
      forceInterval: true,
      approximate: true,
      requester: requester
    })
  };

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
