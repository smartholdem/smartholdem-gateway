const request = require("request");
const jsonFile = require('jsonfile');
const appConfig = jsonFile.readFileSync("./config.json");

let recipient = 'SRNX5xMuoVXfMTvzByXw8gRNyHhKFu7uty';
let amount = 1.00;

request({
    method: 'post',
    json: true, // Use,If you are sending JSON data
    url: 'http://localhost:' + appConfig.app.port + '/api/sendtoaddress',
    body: {
        "recipient" : recipient,
        "amount": amount,
        "comment": "YourComment"
    },
    headers: {
        "Content-Type": "application/json",
        "appkey": appConfig.app.appKey
    }
}, function (err, res, data) {
    if (!err) {
        console.log(data);
    } else {
        console.log(err)
    }
});
