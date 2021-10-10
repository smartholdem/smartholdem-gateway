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
const moment = require("moment");
const axios = require("axios");
const zlib = require('zlib');
const through = require('through');
const util = require("../modules/util");
const appConfig = jsonFile.readFileSync("./config.json");
const db = level('.db', {valueEncoding: 'json'});

// 0x - users
// 1x - address
// 2x - txInWait
// 3x - txInSuccess
// 4x - txOut

let workerBlock = 0;
console.log('STH NODE', appConfig.smartholdem.preferredNode)

smartholdemApi.setPreferredNode(appConfig.smartholdem.preferredNode); // default node
smartholdemApi.init('main'); //main or dev

function init() {
    if (!fs.existsSync('./cache/blocks.json')) {
        smartholdemApi.getBlockchainHeight((error, success, response) => {
            // console.log(response);
            util.log("BlockchainHeight|" + moment().toISOString() + "|" + response.height + "\r\n");
            jsonFile.writeFileSync('./cache/blocks.json', {
                "workerBlock": response.height - appConfig.smartholdem.confirmations
            })
        });
    } else {
        workerBlock = jsonFile.readFileSync('./cache/blocks.json').workerBlock;
        util.log("WorkerHeight|" + workerBlock + "|" + moment().toISOString() + "\r\n");
    }

    console.log('GateWay Init on Port:', appConfig.app.port);
    console.log('Start Block', workerBlock);
    console.log('Start Scheduler');
    // 5 блоков каждые 40 сек
    scheduler.scheduleJob("*/7 * * * * *", async () => {
        await shWay.getBlocks()
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
        try {
            let value = await db.get('0x' + account);
            return (value);
        } catch (err) {
            let newAddress = await this.getNewAddressBySalt(account);
            await util.log("newaddress|" + newAddress.addr + "|" + account + "\r\n");
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

    async getTransations(blockId) {
        let result = []
        let response = await axios.get('http://' + appConfig.smartholdem.preferredNode + ':6100/api/transactions?blockId=' + blockId)
        if (response.data) {
            result = response.data.transactions
        }
        return result
    }

    async getTxs(blockId) {
        let txs = await this.getTransations(blockId)
        for (let i = 0; i < txs.length; i++) {
            if (txs[i].type === 0 && txs[i].amount >= (appConfig.smartholdem.minDeposit * 10 ** 8)) {
                let dataSearch = await this.searchAddress(txs[i].recipientId)
                if (dataSearch.found) {
                    let preparedTx = {
                        id: txs[i].id,
                        recipientId: txs[i].recipientId,
                        comment: txs[i].vendorField,
                        account: dataSearch.account,
                        amount: txs[i].amount, // 10 ** 8
                        timestamp: 1511269200 + txs[i].timestamp
                    };

                    db.get('3x' + txs[i].id, function (err, value) {
                        if (err) {
                            util.log("newtxin|" + (preparedTx.amount / 100000000) + "STH|" + preparedTx.account + "|" + preparedTx.recipientId + "|" + moment().toISOString() + "\r\n");
                            db.put('2x' + txs[i].id, preparedTx);
                        }
                    });
                }
            }
        }
    }

    async getBlocks() {
        let response = await axios.get('http://' + appConfig.smartholdem.preferredNode + ':6100/api/blocks?height=' + workerBlock)
        if (response.data) {
            let blocks = response.data.blocks
            if (blocks.length < 1) {
                return
            }
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].numberOfTransactions > 0) {
                    console.log(blocks[i].height, 'count txs', blocks[i].numberOfTransactions)
                    await this.getTxs(blocks[i].id);
                }
            }
            workerBlock++
            await jsonFile.writeFile('./cache/blocks.json', {"workerBlock": workerBlock});
        }
    }

    async getNewAddressBIP39() {
        let MNEMONIC = bip39.generateMnemonic();
        let PUB_KEY = sth.crypto.getKeys(MNEMONIC).publicKey;
        let ADDR = sth.crypto.getAddress(PUB_KEY);
        return ({
            "address": ADDR,
            "passphrase": MNEMONIC,
            "pubkey": PUB_KEY
        })
    }

    async getNewAddress(type) {
        let NewAddress;
        switch (type) {
            case 'bip39':
                NewAddress = await this.getNewAddressBIP39();
                break;

            default:
                NewAddress = await this.getNewAddressBIP39();
                break;
        }

        return (NewAddress);
    }

    async sendtoaddress(recipient, amount, comment = null) {
        return (await this.sendfrom(appConfig.smartholdem.masterKey, recipient, amount, comment));
    }

    async sendfrom(senderPassphrase, recipient, amount, comment = null) {
        let transaction = smartholdemApi.createTransaction(
            senderPassphrase,
            recipient,
            amount * Math.pow(10, 8),
            {"vendorField": comment}
        );

        return new Promise((resolve, reject) => {
            smartholdemApi.sendTransactions([transaction], (error, success, responseSend) => {
                if (responseSend.success === true) {
                    let txOutData = {
                        txId: responseSend.transactionIds[0],
                        amount: amount,
                        recipient: recipient,
                        timestamp: Math.floor(Date.now() / 1000)
                    };
                    this.dbput('4x' + txOutData.txId, txOutData);
                    resolve(responseSend);
                } else {
                    reject({"err": error});
                }
            });
        });

    }

    async dbput(key, value) {
        return (await db.put(key, value));
    }

    async reportsTxsOut() {
        return (await this.readDb(4, 5));
    }

}

/** tx alert **/
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

router.get('/getnewaddress/:type', function (req, res, next) {
    shWay.getNewAddress(req.params["type"])
        .then(function (newAddress) {
            res.json(newAddress);
        })
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

/** STH tx receipt in gateway **/
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

router.post('/db/backup', function (req, res, next) {
    if (appConfig.app.appKey === req.headers['appkey']) {
        var backingup = false;
        let backupFile = "./backup/backupjson.log.gz";
        if (backingup) res.json('im already backing up');
        // console.log('backup started!');
        let t = Date.now();

        // an example of backing up to a file.
        db.createReadStream()
            .pipe(through(function (obj) {
                // depending on if you store binary data your serialization method could be msgpack.
                this.queue(JSON.stringify(obj) + "\n");
            }))
            .pipe(zlib.createGzip())
            .pipe(fs.createWriteStream(backupFile))
            .on("close", function () {
                backingup = false;
                util.log(moment().toISOString() + ' backup complete. took ', Date.now() - t, 'ms');
                res.json({"ms": Date.now() - t, "success": true});
            })
    } else {
        res.json(null);
    }
});

// Send STH from Master-Address
router.post('/sendtoaddress', function (req, res, next) {
    if (appConfig.app.appKey === req.headers['appkey']) {
        let comment = null;
        if (req.body.comment) {
            comment = req.body.comment;
        }
        shWay.sendtoaddress(req.body.recipient, req.body.amount, comment).then(function (data) {
            res.json(data);
        });
    } else {
        res.json(null);
    }
});

// Send STH From Custom Address
router.post('/sendfrom', function (req, res, next) {
    if (appConfig.app.appKey === req.headers['appkey']) {
        let comment = null;
        if (req.body.comment) {
            comment = req.body.comment;
        }
        shWay.sendfrom(req.body.passphrase, req.body.recipient, req.body.amount, comment)
            .then(function (data) {
                res.json(data);
            });
    } else {
        res.json(null);
    }
});

router.get('/reports/txout', function (req, res, next) {
    shWay.readDb(4, 5).then(function (data) {
        res.json(data);
    });
});

router.get('/reports/txinwait', function (req, res, next) {
    shWay.readDb(2, 3).then(function (data) {
        res.json(data);
    });
});

router.get('/reports/txinsuccess', function (req, res, next) {
    shWay.readDb(3, 4).then(function (data) {
        res.json(data);
    });
});

router.get('/transactions/block/:id', function (req, res, next) {
    shWay.getTransations(req.params["id"]).then(function (data) {
        res.json(data);
    });
});

module.exports = router;
