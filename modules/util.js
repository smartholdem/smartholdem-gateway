"use strict";
const fs = require("fs");

exports.log = (msg, async) => {
    console.log(msg);
    if (async)
        fs.appendFile('sth.log', msg);
    else
        fs.appendFileSync('sth.log', msg);
};
