require('dotenv').config();

const express = require('express');
const ApiServer = express();
const sendRequest = require('request');

const APISecret = process.env.APISecret;
const APIPort = process.env.APIPort;
const CFAuthKey = process.env.CFAuthKey;
const CFApiURL = "https://api.cloudflare.com/client/v4/zones/" + process.env.CFZoneID + "/dns_records";

ApiServer.use(express.json());

function sendLogging(msg) { console.log(String(msg)); }

ApiServer.listen(APIPort, () => sendLogging('API ist Online :)'));

function getRandomName(service) {
    let name = "testName";

    //TODO: NAME GENERIEREN

    if (service === "minecraft") {

        service = "_minecraft._tcp.";

    }

    return service + name;
}

ApiServer.post('/getAndCreateDomain', (req, res) => {
    sendLogging("API Zugriff!!");

    const authHeader = req.get('Authorization'); 
    if (!authHeader || authHeader !== APISecret) {
        sendLogging("Ungültiger oder fehlender Authorization-Header");
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.is('application/json')) {
        sendLogging("Non JSON data received!");
        return res.status(415).end();
    }

    const recData = req.body;

    const srvName = getRandomName(recData.service) + ".egopvp-hosting.com";
  //  sendLogging(srvName);

    const bodyData = {
        name: srvName,
        type: "SRV",
        ttl: 1,
        comment: `${recData.ogTarget} - ${recData.ogPort}`,
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
            sendLogging("Transportfehler: " + err.message);
            return res.status(502).end();
        }
        //   sendLogging(`CF status= ${res2.statusCode} body= ${JSON.stringify(body)}`);
        if (res2.statusCode >= 200 && res2.statusCode < 300) {
            return res.status(200).end();
        } else {
            return res.status(400).end();
        }
    });
});
