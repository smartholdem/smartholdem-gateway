# SmartHoldem GateWay

App in development process now..

Gateway for exchanges, stores, services etc

This application provides full interaction with SmartHoldem (STH) BlockChain with RPC-JSON

### RoadMap:

- Receipt of payments
- Sending payments
- Generate user addresses
- Alert service about new payment
- Payment statistics
- Integration with others BlockChain platforms
- BIP44 Addresses
- BIP32
- Invoices

## Requirements

nodejs 8.x+

## Install

```shell
cd smartholdem-gateway
npm install -g npm forever grunt-cli
npm install
````

## Settings

```shell
mv sample.config.json config.json
```

## Run

```shell
forever start ./bin/www
```

## API
