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
`-s`, `--sql`         | run this SQL query
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
facet -h 10.20.30.40 -s "SELECT MAX(__time) AS maxTime FROM twitterstream"
```

Returns:

```
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
facet -h 10.20.30.40 -s "SELECT COUNT() as 'cnt' FROM twitterstream GROUP BY first_hashtag ORDER BY cnt DESC"
```

This will throw an error because there is no time filter specified and the cli guards against this.

This behaviour can be disabled using the `--allow eternity` flag but it is generally bad idea to do it when working with large amounts of data.
  
Let's try it again, with a time filter this time:
  
```
facet -h 10.20.30.40 -s "
SELECT
COUNT() as 'cnt'
FROM twitterstream
WHERE '2015-04-15T00:00:00' <= __time AND __time < '2015-04-16T00:00:00'
GROUP BY first_hashtag
ORDER BY cnt DESC
LIMIT 5
"
```
  

```
facet -h 10.20.30.40 -i P1D -s "SELECT COUNT() as 'cnt' FROM twitterstream GROUP BY first_hashtag ORDER BY cnt DESC"
```



```
facet -h 10.20.30.40 -i P1D -s "SELECT COUNT() as 'cnt' FROM twitterstream GROUP BY first_hashtag ORDER BY cnt DESC LIMIT 10"
```
