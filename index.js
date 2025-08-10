var express = require('express');
var ApiServer = express();
var sendRequest = require('request');


const APISecret = process.env.APISecret;
const APIPort = process.env.APIPort;

const CFAuthKey = process.env.CFAuthKey;
const CFAuthEmail = process.env.CFAuthEmail;
const CFApiURL = process.env.CFApiURL;

function sendLogging(logmsg) {
    console.log(logmsg.toString());
}

ApiServer.listen(APIPort, function () {
    sendLogging('API ist Online :)')
})


function getRandomName(service) {
    const name = "testName";

    //TODO: generate name

    if(service == "minecraft" ){
        service = "_minecraft._tcp."
    }

    name = service+name;

    return name;
}
ApiServer.post('/getAndCreateDomain', function (req, res) {
    sendLogging("API Zugriff!!")
    var recData = ''

    req.on('data', function (data) {
        recData = JSON.parse(data.toString())

        if (recData.authkey === APISecret) {

            srvName = getRandomName(recData.service)

            const bodyData = {
                "name": srvName,
                "type": "SRV",
                "ttl": "1",
                "data": {
                    "port": recData.ogPort,
                    "priority": "10",
                    "target": recData.ogTarget,
                    "weight": "10"
                }
            };

            request({
                headers: {
                    'X-Auth-Email': CFAuthEmail,
                    'X-Auth-Key': CFAuthKey,
                    'Content-Type': 'application/json'
                },
                uri: CFApiURL,
                body: bodyData,
                method: 'PUT'
            }, function (err, res, body) {
                if (!err && res.statusCode == 200) {
                        console.log(body);

                        sendLogging("Erfolgreich! erstellt!")

                        res.status('200').end('');

                    } else {
                        sendLogging(err);
                        sendLogging("\n");
                        sendLogging(res);
                    }
            });


        } else {
            sendLogging('**API** \n Anfrage ist Unverified \nKey: ' + recData.key)
            res.status('418').end();
        }
    });
})