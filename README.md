# SmartHoldem GateWay

App in development process now..

Gateway for exchanges, stores, services etc

This application provides full interaction with SmartHoldem (STH) BlockChain with RPC-JSON

### Features:

- Receipt of payments (+)
- Validate Addresses (+)
- Sending payments (+)
- Generate user addresses (+)
- Alert service about new payment (+)
- Payment statistics (~)
- Integration with others BlockChain platforms (~)
- BIP39 (+)
- BIP44 Addresses (~)
- BIP32
- Invoices
- Documentation (~)
- Logs sth.log (+)

## Requirements

- NodeJs 8.x+
- SmartHoldem Node-A (optional) https://github.com/smartholdem/smartholdem-node-a

## Install

```shell
cd smartholdem-gateway
npm install -g npm forever grunt-cli
npm install
````

## Settings

```shell
mv sample.config.json config.json
nano config.json
```


```javascript
{
  "app": {
    "port": 3000, // Default App port
    "localhostOnly": false,
    "appKey": "Your_Uniq_Any_Private_Random_Password",
    "debug": false,
    "backups": true
  },
  "smartholdem": {
    "preferredNode": "127.0.0.1", // SmartHoldem Node IP-Address
    "masterAddress": "", // Main STH-Address
    "masterKey": "", // Main STH-Address Pass Phrase
    "salt": "", // required to generate internal addresses
    "consolidateOnMasterAddress": true,
    "confirmations": 10,
    "blocks": 6, // the number of processed blocks
    "minAmount": 10
  },
  "callbacks": {
    "sendCallback": false, // notify about incoming transactions external service
    "password": "1234567890", // external service password
    "alertTxUrl": "http://yourWebSite.com/newtx" // web service url
  }
}
```

## Run

As daemon background process:

```shell
sh restart.sh
```

As debug console:

```shell
npm start
```

## Stop process

```shell
sh stop.sh
```

## API

### Get STH Address

A new address will be created if not found in the database.

```shell
GET http://localhost:3000/api/getaddress/username
```

return address json

```json
{
  "addr": "SWE5yaoYZbKKn6n6SXBur3gceetUJTR1yk"
}
```

### Validate Address

```shell
GET http://localhost:3000/api/validate/SWE5yaoYZbKKn6n6SXBur3gceetUJTR1yk
```

### Gen New STH Address BIP39

BIP39 Addresses are not saved to the database.

```shell
GET http://localhost:3000/api/getnewaddress/bip39
```

return json

```json
{
  "address": "SWkELwTqgUrfQ81DfKRbk6q7UXYrvzZgQb",
  "passphrase": "thought love copper tag image trigger swamp warm flee crunch input direct",
  "pubkey": "02c61c9c01ca0852690c793989b99c084b82a6287ece6045c1b64ee4a7d4daac0d"
}
```
