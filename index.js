require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const ApiServer = express();
const sendRequest = require('request');

const APISecret = process.env.APISecret;
const APIPort = process.env.APIPort;
const DomainSuffix = process.env.DomainSuffix;
const CFAuthKey = process.env.CFAuthKey;
const CFApiURL = "https://api.cloudflare.com/client/v4/zones/" + process.env.CFZoneID + "/dns_records";

const filePath = path.join(__dirname, 'strings.txt');
let stringList = [];

ApiServer.use(express.json());

function sendLogging(msg) { console.log(String(msg)); }

ApiServer.listen(APIPort, () => sendLogging('API is Online :)'));

loadStrings();

function getRandomName() {
    const name = getRandomAndRemove();
    if (!name) return null;
    return name;
}
function getService(serv) {
    var service = serv
    if (service == "minecraft") {
        service = "_minecraft._tcp.";
    } else if (service == "sinusbot") {
        service = "_http._tcp.";
    } else if (service == "nginx") {
        service = "_http._tcp.";
    } else if (service == "teamspeak3") {
        service = "_ts3._udp.";
    } else if (service == "nodejs") {
        service = "_http._tcp.";
    } else {
        service = "INVALID";
        sendLogging("Unknown Service... Returning Real IP")
    }
    return service;
}
ApiServer.post('/getAndCreateDomain', (req, res) => {
    sendLogging("API Access /getAndCreateDomain");

    const authHeader = req.get('Authorization');
    if (!authHeader || authHeader !== APISecret) {
        sendLogging("Invalid Auth Header");
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.is('application/json')) {
        sendLogging("No JSON data received!");
        return res.status(415).end();
    }

    const recData = req.body;

    const randomName = getRandomName();
    const Service = getService(recData.service);

    if (Service == "INVALID") {
        return res.status(200).end(`${recData.ogTarget}:${recData.ogPort}`);
    }

    const srvName = `${Service}${randomName}${DomainSuffix}`;

    if (randomName == "null" || !randomName || randomName == null) {
        return res.status(500).json({ error: "No Strings available" });
    }
    const bodyData = {
        name: srvName,
        type: "SRV",
        ttl: 1,
        comment: `${recData.comment}`,
        data: {
            port: Number(recData.ogPort),
            priority: 10,
            target: recData.ogTarget,
            weight: 10
        }
    };
    //   sendLogging(JSON.stringify(bodyData));

    sendRequest({
        method: 'POST',
        uri: CFApiURL,
        headers: { Authorization: `Bearer ${CFAuthKey}` },
        json: true,
        body: bodyData
    }, (err, res2, body) => {
        if (err) {
            sendLogging("Transportation error: " + err.message);
            return res.status(502).end();
        }
        //   sendLogging(`CF status= ${res2.statusCode} body= ${JSON.stringify(body)}`);
        if (res2.statusCode >= 200 && res2.statusCode < 300) {
            return res.status(200).end(`${randomName}${DomainSuffix}`);
        } else {
            return res.status(400).end();
        }
    });
});
ApiServer.post('/removeDomain', (req, res) => {
    sendLogging("API Access /removeDomain");

    const authHeader = req.get('Authorization');
    if (!authHeader || authHeader !== APISecret) {
        sendLogging("Invalid Auth Header");
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.is('application/json')) {
        sendLogging("No JSON data received!");
        return res.status(415).end();
    }

    const { oldDomain, service } = req.body || {};
    if (!oldDomain || typeof oldDomain !== 'string') {
        sendLogging("No 'oldDomain' Specified");
        return res.status(400).end();
    }

    let prefix = String(oldDomain).trim();
    if (prefix.toLowerCase().endsWith(DomainSuffix)) {
        prefix = prefix.slice(0, -DomainSuffix.length);
    }

    const servicePrefix = getService(service || "");
    if (servicePrefix && prefix.toLowerCase().startsWith(servicePrefix.toLowerCase())) {
        prefix = prefix.slice(servicePrefix.length);
    }

    const fullRecordName = `${servicePrefix}${prefix}${DomainSuffix}`;

    const listUri = `${CFApiURL}?type=SRV&name=${encodeURIComponent(fullRecordName)}`;

    sendRequest({
        method: 'GET',
        uri: listUri,
        headers: { Authorization: `Bearer ${CFAuthKey}` },
        json: true
    }, (err, res2, body) => {
        if (err) {
            sendLogging("Transportation error: (Lookup): " + err.message);
            return res.status(502).end();
        }
        if (!(res2.statusCode >= 200 && res2.statusCode < 300) || !body || body.success === false) {
            sendLogging(`CF Lookup error: status=${res2 && res2.statusCode} body=${JSON.stringify(body)}`);
            return res.status(res2?.statusCode || 500).end();
        }

        const results = Array.isArray(body.result) ? body.result : [];
        if (results.length === 0) {
            sendLogging(`No SRV record found for ${fullRecordName}`);
            return res.status(404).end();
        }

        let remaining = results.length;
        let deleted = 0;
        let failed = 0;
        const failedItems = [];

        results.forEach((rec) => {
            const delUri = `${CFApiURL}/${rec.id}`;
            sendRequest({
                method: 'DELETE',
                uri: delUri,
                headers: { Authorization: `Bearer ${CFAuthKey}` },
                json: true
            }, (err3, res3, body3) => {
                if (!err3 && res3.statusCode >= 200 && res3.statusCode < 300 && body3 && body3.success !== false) {
                    deleted++;
                } else {
                    failed++;
                    failedItems.push({ id: rec.id, status: res3 && res3.statusCode, body: body3, err: err3 && err3.message });
                    sendLogging(`Removing error for ID=${rec.id}: status=${res3 && res3.statusCode} body=${JSON.stringify(body3)} err=${err3 && err3.message}`);
                }

                remaining--;
                if (remaining === 0) {
                    if (deleted > 0) {
                        addPrefixBackToFile(prefix);
                        if (failed === 0) {
                            return res.status(200).end();
                        }
                        return res.status(200).end();
                    }
                    return res.status(500).end();
                }
            });
        });
    });
});


function loadStrings() {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`File ${filePath} doesnt exist – creating new.`);
            fs.writeFileSync(filePath, '', 'utf8');
        }
        const content = fs.readFileSync(filePath, 'utf8');
        stringList = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        console.log(`Loaded: ${stringList.length} Strings`);
    } catch (err) {
        console.error('Error loading the file:', err);
        stringList = [];
    }
}

function getRandomAndRemove() {
    if (stringList.length === 0) {
        console.warn('No Strings Available');
        return null;
    }
    const index = Math.floor(Math.random() * stringList.length);
    const chosen = stringList.splice(index, 1)[0];
    try {
        fs.writeFileSync(filePath, stringList.join('\n') + '\n', 'utf8');
    } catch (err) {
        console.error('Error writing the file:', err);
    }
    return chosen;
}

function addPrefixBackToFile(prefix) {
    const clean = String(prefix || '').trim();
    if (!clean) return;
    if (!stringList.includes(clean)) {
        stringList.push(clean);
        try {
            fs.writeFileSync(filePath, stringList.join('\n') + '\n', 'utf8');
            sendLogging(`Prefix Restored: ${clean}`);
        } catch (err) {
            console.error('Error writing the file', err);
        }
    }
}