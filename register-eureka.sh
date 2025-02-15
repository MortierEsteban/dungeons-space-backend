#!/bin/bash

# $1 is used as the host name.

EUREKA_HOST="localhost"
EUREKA_PORT="8761"
EUREKA_URI="http://$EUREKA_HOST:$EUREKA_PORT"

SERVICE_NAME="FAKE-SERVICE"
SERVICE_PROTOCOL="http"
SERVICE_HOST="fake.com"
SERVICE_PORT="5000"

SERVICE_URI="$SERVICE_PROTOCOL://$SERVICE_HOST:$SERVICE_PORT"
HOME_URI="$SERVICE_URI/home"
HEALTH_URI="$SERVICE_URI/health"

# This is the URL shown in the "status" field in the
# instances section of the eureka dashboard.
#
# It's up to you to decide what the URL points to. Some
# information or status endpoint might be good.
STATUS_URI="$SERVICE_URI/health"

# This is the name displayed to the right of the status
# on the eureka dashbard. If the app (FAKE_SERVICE) is
# registered with more than one hostname, they will be
# displayed as a comma-separated list. This hostname
# is part of the heartbeat message.
#
# If you'll have more than one host per service,
# make sure they have different host names.
HOST_NAME="${1:-fake01}"

# Everyone of these parameters seem to be required. I don't know
# anything about secureVipAddress and vipAddress.
#
# dataCenterInfo must have a name of "MyOwn" or "Amazon".
#
# status can be UP, DOWN, STARTING, OUT_OF_SERVICE, UNKNOWN.
#   if the registration status is STARTING, then the service
#   will never be evicted. Also, simply sending a Heartbeat
#   does not change the status.
#
# The metadata fields can be any information you want associated
# with a service. I recommend keeping it short.
#

cat <<EOF > /tmp/json.json
{
  "instance": {
    "app": "$SERVICE_NAME",
    "dataCenterInfo": {
      "@class": "com.netflix.appinfo.MyDataCenterInfo",
      "name": "MyOwn"
    },
    "healthCheckUrl": "$HEALTH_URI",
    "homePageUrl": "$HOME_URI",
    "hostName": "$HOST_NAME",
    "ipAddr": "$SERVICE_HOST",
    "leaseInfo": {
      "evictionDurationInSecs": 90
    },
    "metadata": {
      "owner": "$SERVICE_NAME",
      "cost-code": "$COST_CODE"
    },
    "port": {
      "\$": 5000,
      "@enabled": "true"
    },
    "securePort": {
      "\$": 443,
      "@enabled": "false"
    },
    "secureVipAddress": null,
    "status": "UP",
    "statusPageUrl": "$STATUS_URI",
    "vipAddress": null
  }
}
EOF


curl \
  --header "content-type: application/json" \
  --data-binary @/tmp/json.json \
  $EUREKA_URI/eureka/apps/$SERVICE_NAME