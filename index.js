require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const ApiServer = express();
const sendRequest = require('request');

const APISecret = process.env.APISecret;
const APIPort = process.env.APIPort;
const CFAuthKey = process.env.CFAuthKey;
const CFApiURL = "https://api.cloudflare.com/client/v4/zones/" + process.env.CFZoneID + "/dns_records";

const filePath = path.join(__dirname, 'strings.txt');
let stringList = [];

ApiServer.use(express.json());

function sendLogging(msg) { console.log(String(msg)); }

ApiServer.listen(APIPort, () => sendLogging('API ist Online :)'));

loadStrings();

function getRandomName(service) {
    let name = getRandomAndRemove();

    if (service == "minecraft") {

        service = "_minecraft._tcp.";

    }

    if (!name) {
        return null;
    } else {
        return service + name;
    }
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

    const randomName = getRandomName(recData.service);
    const srvName = + randomName + ".egopvp-hosting.com";

    if (randomName == "null" || !randomName || randomName == null) {
        return res.status(500).json({ error: "No Strings available" });
    }
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
            return res.status(200).end(srvName);
        } else {
            return res.status(400).end("CF Error");
        }
    });
});
ApiServer.post('/removeDomain', (req, res) => {
    sendLogging("API Zugriff!! /removeDomain");

    // 1) Auth check (gleich wie bei /getAndCreateDomain)
    const authHeader = req.get('Authorization');
    if (!authHeader || authHeader !== APISecret) {
        sendLogging("Ungültiger oder fehlender Authorization-Header");
        return res.status(401).json({ error: "Unauthorized" });
    }

    // 2) Content-Type & Payload prüfen
    if (!req.is('application/json')) {
        sendLogging("Non JSON data received!");
        return res.status(415).end();
    }
    const { oldDomain } = req.body || {};
    if (!oldDomain || typeof oldDomain !== 'string') {
        return res.status(400).json({ error: 'Field "oldDomain" is required (string).' });
    }

    // 3) Cloudflare: passenden SRV-Record per Name suchen
    const listUri = `${CFApiURL}?type=SRV&name=${encodeURIComponent(oldDomain)}`;

    sendRequest({
        method: 'GET',
        uri: listUri,
        headers: { Authorization: `Bearer ${CFAuthKey}` },
        json: true
    }, (err, res2, body) => {
        if (err) {
            sendLogging("Transportfehler (Lookup): " + err.message);
            return res.status(502).json({ error: 'Transport error (lookup)' });
        }
        if (!(res2.statusCode >= 200 && res2.statusCode < 300) || !body || body.success === false) {
            sendLogging(`CF Lookup fehlgeschlagen: status=${res2 && res2.statusCode} body=${JSON.stringify(body)}`);
            return res.status(res2?.statusCode || 500).json({ error: 'Lookup failed', details: body });
        }

        const results = Array.isArray(body.result) ? body.result : [];
        if (results.length === 0) {
            sendLogging(`Kein SRV-Record gefunden für ${oldDomain}`);
            return res.status(404).json({ error: 'Record not found', oldDomain });
        }

        // 4) Alle gefundenen Records löschen
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
                    sendLogging(`Löschen fehlgeschlagen für ID=${rec.id}: status=${res3 && res3.statusCode} body=${JSON.stringify(body3)} err=${err3 && err3.message}`);
                }

                remaining--;
                if (remaining === 0) {
                    if (deleted > 0 && failed === 0) {
                        sendLogging("Alle Gelöscht")
                        return res.status(200).json({ ok: true, deleted, oldDomain });
                    }
                    if (deleted > 0 && failed > 0) {
                        sendLogging("Teile Gelöscht")
                        return res.status(200).json({ ok: true, deleted, failed, oldDomain, failedItems });
                    }
                    // Nichts gelöscht
                    sendLogging({ error: 'Deletion failed', oldDomain, failedItems })
                    return res.status(500).end();
                }
            });
        });
    });
});


function loadStrings() {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`Datei ${filePath} existiert nicht – erstelle neue.`);
            fs.writeFileSync(filePath, '', 'utf8');
        }
        const content = fs.readFileSync(filePath, 'utf8');
        stringList = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        console.log(`Geladen: ${stringList.length} Strings`);
    } catch (err) {
        console.error('Fehler beim Laden der Datei:', err);
        stringList = [];
    }
}

function getRandomAndRemove() {
    if (stringList.length === 0) {
        console.warn('Keine Strings mehr verfügbar.');
        return null;
    }
    const index = Math.floor(Math.random() * stringList.length);
    const chosen = stringList.splice(index, 1)[0];
    try {
        fs.writeFileSync(filePath, stringList.join('\n') + '\n', 'utf8');
    } catch (err) {
        console.error('Fehler beim Schreiben der Datei:', err);
    }
    return chosen;
}