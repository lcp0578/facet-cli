# facet-cli

## Installation

```
npm install -g facet-cli
```

## Usage

Currently only queries to Druid are supported. More support will come in the future. 

The CLI supports the following options:

## Examples

Here are some examples of queries

### Max time

```
facet -h 10.20.30.40 -i P1D -s "SELECT MAX(__time) FROM twitterstream"
```

