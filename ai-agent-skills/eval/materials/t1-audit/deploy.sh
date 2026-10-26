#!/bin/sh
set -e
export REGION=eu-west-1
aws s3 sync ./dist s3://example-bucket
