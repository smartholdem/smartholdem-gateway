var express = require('express');
var router = express.Router();
const fs = require("fs");
const level = require('level');
const smartholdemApi = require("sthjs-wrapper");
const jsonFile = require('jsonfile');
const sth = require("sthjs");
const bip39 = require("bip39");
const scheduler = require("node-schedule");
const appConfig = jsonFile.readFileSync("./config.json");
const db = level('.db', {valueEncoding: 'json'});

// 0x - users
// 1x - address
// 2x - txInWait
// 3x - txInSuccess
// 4x - txOut

let workerBlock = 0;

// main class
class SHWAY {
    init() {
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
        console.log('Started Block:', workerBlock)
    }

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
            return (value)
        } catch (err) {
            console.log('add new address');
            return (this.getNewAddressBySalt(account))
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
                .on('error', function (err) {
                    reject(err);
                })
                .on('end', function () {
                    resolve(list);
                });
        });
    }

    async getBlocks(offset) {
        await smartholdemApi.getBlocks({
            "limit": appConfig.smartholdem.blocks,
            "offset": offset,
            "orderBy": "height:asc"
        }, (error, success, response) => {
            // console.log(response.blocks);
            for (let i = 0; i < response.blocks.length; i++) {
                if (response.blocks[i].numberOfTransactions > 0) {
                    console.log(response.blocks[i]);
                }
            }

            workerBlock = workerBlock + response.blocks.length;
            jsonReader.writeFile('./cache/blocks.json', {"workerBlock": workerBlock});
            console.log(workerBlock, response.blocks.length);
        });
    }

    async searchAddress(recipient) {
        try {
            return (await db.get('1x' + recipient));
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
                    if (response.transactions[i].type === 0) {
                        this.searchAddress(response.transactions[i].recipientId).then(function(data){

                        })
                    }
                }
            }

        });
    }

}


const shWay = new SHWAY();
shWay.init();

const dbGetKey = (key) => {
    return new Promise((resolve, reject) => {
        db.get(key, function (err, data) {
            if (!err) {
                resolve(data);
            }
            reject(key);
        });
    });
};


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

module.exports = router;
