# facet-cli

A command line interface for facet

## Installation

```
npm install -g facet-cli
```

## Usage

Currently only queries to Druid are supported. More support will come in the future. 

The CLI supports the following options:

Option                | Description
----------------------|-----------------------------------------
`--help`              | print this help message
`--version`           | display the version number
`-v`, `--verbose`     | display the queries that are being made
`-h`, `--host`        | the host to connect to
`-d`, `--data-source` | use this data source for the query (supersedes FROM clause)
`-i`, `--interval`    | add (AND) a __time filter between NOW-INTERVAL and NOW
`-q`, `--query`       | the query to run
`-o`, `--output`      | specify the output format. Possible values: `json` **(default)**, `csv`
`-a`, `--allow`       | enable a behaviour that is turned off by default `eternity` allow queries not filtered on time `select` allow select queries

## Examples

For now the CLI can only issue Druid queries but eventually all facet supported data connectors will be supported.
(strangely there seems to be less demand for a SQL interface to MySQL)

## Druid example

Lets imagine that your Druid broker node is located at `10.20.30.40` on the standard port (`8080`) and that there is a
datasource called `twitterstream` that has tweets in it.

Here is a simple query that gets the maximum of the `__time` column which tells you what how up to date the data in the database is.

```
facet -h 10.20.30.40 -q "SELECT MAX(__time) AS maxTime FROM twitterstream"
```

Returns:

```json
[
  {
    "maxTime": {
      "type": "TIME",
      "value": "2015-04-16T20:49:00.000Z"
    }
  }
]
```

Ok now you might want to examine the different hashtags that are trending.

You might do a group by on the `first_hashtag` column like this:

```
facet -h 10.20.30.40 -q "
SELECT
first_hashtag as hashtag,
COUNT() as cnt
FROM twitterstream
WHERE '2015-04-15T00:00:00' <= __time AND __time < '2015-04-16T00:00:00'
GROUP BY first_hashtag
ORDER BY cnt DESC
LIMIT 5
```

This will throw an error because there is no time filter specified and the facet-cli guards against this.

This behaviour can be disabled using the `--allow eternity` flag but it is generally bad idea to do it when working with
large amounts of data as it can issue computationally prohibitive queries.
  
Let's try it again, with a time filter:
  
```
facet -h 10.20.30.40 -q "
SELECT
first_hashtag as hashtag,
COUNT() as cnt
FROM twitterstream
WHERE '2015-04-15T00:00:00' <= __time AND __time < '2015-04-16T00:00:00'
GROUP BY first_hashtag
ORDER BY cnt DESC
LIMIT 5
"
```

Results:
  
```json
[
  {
    "cnt": 3480496,
    "hashtag": "No Hashtag"
  },
  {
    "cnt": 7691,
    "hashtag": "FOLLOWTRICK"
  },
  {
    "cnt": 6059,
    "hashtag": "5YearsSinceNiallsAudition"
  },
  {
    "cnt": 4392,
    "hashtag": "ShotsUpdateNextWeek"
  },
  {
    "cnt": 3729,
    "hashtag": "EXO"
  }
]
```
  
The facet-cli has an option `--interval` (`-i`) that automatically filters time on the last `interval` worth of time.
It is useful if you do not want to type out a time filter.

```
facet -h 10.20.30.40 -i P1D -q "
SELECT
first_hashtag as hashtag,
COUNT() as cnt
FROM twitterstream
GROUP BY first_hashtag
ORDER BY cnt DESC
LIMIT 5
"
```

To get a breakdown by time the `TIME_BUCKET` function can be used:

```
facet -h 10.20.30.40 -i P1D -q "
SELECT
SUM(tweet_length) as TotalTweetLength
FROM twitterstream
GROUP BY TIME_BUCKET(__time, PT1H, 'Etc/UTC')
"
```

Returns:

```json
[
  {
    "TotalTweetLength": 9748287,
    "split": {
      "start": "2015-04-18T15:00:00.000Z",
      "end": "2015-04-18T16:00:00.000Z",
      "type": "TIME_RANGE"
    }
  },
  {
    "TotalTweetLength": 15321726,
    "split": {
      "start": "2015-04-18T16:00:00.000Z",
      "end": "2015-04-18T17:00:00.000Z",
      "type": "TIME_RANGE"
    }
  },
  ...
]
```

Note that the grouping column was not selected but was still returned as if `TIME_BUCKET(__time, PT1H, 'Etc/UTC') as 'split'`
was one of the select clauses.

## Issues

If you find queries that you think should work but don't please open an issue on GitHub.
