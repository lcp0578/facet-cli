# facet-cli

A command line interface for facet

## Installation

```
npm install -g facet-cli
```

## Usage

Currently only queries to Druid are supported. More support will come in the future. 

The CLI supports the following options:

`--help`            | print this help message
`--version`         | display the version number
`-v, --verbose`     | display the queries that are being made
`-h, --host`        | the host to connect to
`-d, --data-source` | use this data source for the query (supersedes FROM clause)
`-s, --sql`         | run this SQL query
`-o, --output`      | specify the output format. Possible values: json (default), csv`
`-a, --allow`       | enable a behaviour that is turned off by default `eternity` allow queries not filtered on time `select` allow select queries

## Examples

For now the CLI can only issue Druid queries but eventually all facet supported data connectors will be supported.
(strangely there seems to be less demand for a SQL interface to MySQL)

### Max time



```
facet -h 10.20.30.40 -s "SELECT MAX(__time) FROM twitterstream"
```

### Group By

```
facet -h 10.20.30.40 -i P1D -s "SELECT COUNT() as 'cnt' FROM twitterstream GROUP BY first_hashtag ORDER BY cnt DESC LIMIT 10"
```