#!/usr/bin/env bash
cd "$(dirname "$0")"
browserify *.js | testling | faucet