var express = require('express');
var router = express.Router();
const fs = require("fs");
const level = require('level');
const smartholdemApi = require("sthjs-wrapper");
const jsonFile = require('jsonfile');
const sth = require("sthjs");
const bip39 = require("bip39");
const scheduler = require("node-schedule");
const request = require("request");
const appConfig = jsonFile.readFileSync("./config.json");
const db = level('.db', {valueEncoding: 'json'});

// 0x - users
// 1x - address
// 2x - txInWait
// 3x - txInSuccess
// 4x - txOut

let workerBlock = 0;

function init() {
    smartholdemApi.setPreferredNode(appConfig.smartholdem.preferredNode); // default node
    smartholdemApi.init('main'); //main or dev

    if (!fs.existsSync('./cache/blocks.json')) {
        smartholdemApi.getBlockchainHeight((error, success, response) => {
            console.log(response);
            jsonFile.writeFileSync('./cache/blocks.json', {
                "workerBlock": response.height - appConfig.smartholdem.confirmations
            })
        });
    } else {
        workerBlock = jsonFile.readFileSync('./cache/blocks.json').workerBlock;
    }
    console.log('GateWay Init');
    console.log('Start Block', workerBlock);
    console.log('Start Scheduler');
    scheduler.scheduleJob("*/40 * * * * *", () => {
        shWay.getBlocks(workerBlock).then(function () {
        });
    });
}

// main class
class SHWAY {

    async getNewAddressBySalt(account) {
        let PASS = appConfig.smartholdem.salt + account;
        let PUB_KEY = await sth.crypto.getKeys(PASS).publicKey;
        let ADDR = await sth.crypto.getAddress(PUB_KEY);

        await db.put('0x' + account, {
            "addr": ADDR
        });

        await db.put('1x' + ADDR, {
            "account": account,
            "pubKey": PUB_KEY,
            "created": Math.floor(Date.now() / 1000)
        });

        return ({"addr": ADDR});
    }

    async getAddress(account) {
        console.log(account);
        try {
            let value = await db.get('0x' + account);
            return (value);
        } catch (err) {
            console.log('add new address');
            let newAddress = await this.getNewAddressBySalt(account);
            return (newAddress);
        }
    }

    async validate(address) {
        return (sth.crypto.validateAddress(address))
    }

    async readDb(from, to) {
        return new Promise((resolve, reject) => {
            let list = {};
            db.createReadStream({gte: from + 'x', lt: to + 'x', "limit": 10000})
                .on('data', function (data) {
                    list[data.key] = data.value;
                })
                .on('end', function () {
                    resolve(list);
                });
        });
    }

    async searchAddress(recipient) {
        try {
            let value = await db.get('1x' + recipient);
            return ({
                found: true,
                account: value.account
            });
        } catch (err) {
            return ({found: false});
        }
    }

    async getTxs(blockId) {
        await smartholdemApi.getTransactionsList({
            "blockId": blockId
        }, (error, success, response) => {
            if (response.success) {
                for (let i = 0; i < response.transactions.length; i++) {
                    if (response.transactions[i].type === 0 && response.transactions[i].amount >= (appConfig.smartholdem.minAmount * 10 ** 8)) {
                        this.searchAddress(response.transactions[i].recipientId)
                            .then(function (dataSearch) {
                                if (dataSearch.found) {
                                    let preparedTx = {
                                        id: response.transactions[i].id,
                                        recipientId: response.transactions[i].recipientId,
                                        comment: response.transactions[i].vendorField,
                                        account: dataSearch.account,
                                        amount: response.transactions[i].amount, // 10 ** 8
                                        timestamp: 1511269200 + response.transactions[i].timestamp
                                    };

                                    console.log('response.transactions[i].id', response.transactions[i].id);

                                    db.get('3x' + response.transactions[i].id, function (err, value) {
                                        if (err) {
                                            console.log('found new tx', preparedTx);
                                            db.put('2x' + response.transactions[i].id, preparedTx);
                                            if (appConfig.callbacks.sendCallback) {
                                                sendCallbackTx(preparedTx)
                                                    .then(function (callbackResult) {
                                                        console.log(callbackResult);
                                                    });
                                            }
                                        }
                                    });
                                }
                            })
                    }
                }
            }
        });
    }

    async getBlocks(offset) {
        await smartholdemApi.getBlocks({
            "limit": appConfig.smartholdem.blocks,
            "offset": offset,
            "orderBy": "height:asc"
        }, (error, success, response) => {

            for (let i = 0; i < response.blocks.length; i++) {
                if (response.blocks[i].numberOfTransactions > 0) {
                    this.getTxs(response.blocks[i].id);
                }
            }

            workerBlock = workerBlock + response.blocks.length;
            jsonFile.writeFile('./cache/blocks.json', {"workerBlock": workerBlock});
            console.log(workerBlock, response.blocks.length);
        });
    }

}

async function sendCallbackTx(data) {
    return new Promise((resolve, reject) => {
        request({
            method: 'post',
            json: true, // Use,If you are sending JSON data
            url: appConfig.callbacks.alertTxUrl,
            body: data,
            headers: {
                "Content-Type": "application/json",
                "password": appConfig.callbacks.password
            }
        }, function (err, res, data) {
            if (!err) {
                resolve(data);
            } else {
                reject(err)
            }
        });
    });
}

const shWay = new SHWAY();
init();


/* GET home page. */
router.get('/getaddress/:account', function (req, res, next) {
    shWay.getAddress(req.params["account"]).then(function (data) {
        res.json(data);
    });
});

router.get('/validate/:address', function (req, res, next) {
    shWay.validate(req.params["address"]).then(function (data) {
        res.json({"valid": data});
    });
});

// debug only
router.get('/dbget/:from/:to', function (req, res, next) {
    shWay.readDb(req.params["from"], req.params["to"]).then(function (data) {
        res.json(data);
    });
});

/** STH tx in gateway **/
router.post('/txinsuccess', function (req, res, next) {
    if (appConfig.app.appKey === req.headers['appkey']) {
        db.del('2x' + req.body.value.id);
        db.put(req.body.key, req.body.value);
        res.json(true);
    } else {
        res.json(null);
    }
});

/** Put Arbitrary data **/
router.post('/dbput', function (req, res, next) {
    if (appConfig.app.appKey === req.headers['appkey']) {
        db.put(req.body.key, req.body.value);
        res.json(true);
    } else {
        res.json(null);
    }
});

module.exports = router;
