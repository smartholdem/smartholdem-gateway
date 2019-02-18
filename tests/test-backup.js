const request = require("request");
const jsonFile = require('jsonfile');
const appConfig = jsonFile.readFileSync("./config.json");


request({
    method: 'post',
    json: true, // Use,If you are sending JSON data
    url: 'http://localhost:' + appConfig.app.port + '/api/db/backup',
    body: {},
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
