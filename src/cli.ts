/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/nopt/nopt.d.ts" />
"use strict";

interface FlagTypeMap {
  [k: string]: Object
}

interface ShortFlags {
  [k: string]: string[]|string
}

import nopt = require("nopt");

var knownOpts: FlagTypeMap = {
  "flag" : Boolean,
  "many" : [String, Array]
};

var shortHands: ShortFlags = {
  "f" : ["--flag"]
};

var parsed = nopt(knownOpts, shortHands, process.argv, 2);
console.log(parsed);
