const moddableProxy = require("@moddable/pebbleproxy");
var USER_TOKEN = null;
const SERVER_URL = ""
Pebble.addEventListener('ready', moddableProxy.readyReceived);
Pebble.addEventListener('appmessage', moddableProxy.appMessageReceived);

Pebble.addEventListener('ready', function () {
    console.log('PebbleKit JS ready!');
    Pebble.getTimelineToken(
        function (token) {
            console.log('Successfully obtained timeline token: ' + token);

            USER_TOKEN = token;
            console.log(USER_TOKEN);
        },
        function (error) {
            console.log('Error getting timeline token: ' + error);
            sendErrorMessage(error);
        });

    //fetchData();
});
Pebble.addEventListener('appmessage', function (e) {
    var dict = e.payload;
    if (dict && dict['FetchData'] !== undefined) {
        fetchData();
    }
    else if (dict && dict['Subscribe'] !== undefined) {
        timeline_subscribe();
    }
});

function timeline_subscribe() {
    var xhr = new XMLHttpRequest();

    const requestData = {
        "usrtoken": USER_TOKEN,
        "subscribe": "true"
    };
    xhr.onload = function () {
        try {
            const json = JSON.parse(this.responseText);
            console.log("Server responded: " + json.message);
            if (json.success == false) {
                console.log("Server request failed. Retrying...");
                timeline_subscribe();
            }
            else {
                console.log("Server response 200. Pebble subscribed.");
            }
        } catch (e) {
            console.log("Error parsing JSON: " + e);
        }
    };

    xhr.onerror = function () {
        console.log('Network request failed');
    };

    xhr.open('GET', SERVER_URL);
    xhr.send(JSON.stringify(requestData));
}

function fetchData() {
    if (USER_TOKEN != null) {
        console.log('Cannot push pin: USER_TOKEN is missing.');
        Pebble.getTimelineToken(
            function (token) {
                console.log('Successfully obtained timeline token: ' + token);

                USER_TOKEN = token;
                console.log(USER_TOKEN);

            },
            function (error) {
                console.log('Error getting timeline token: ' + error);
                sendErrorMessage(error);
                return;
            });

    }
    var url = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json";
    var xhr = new XMLHttpRequest();

    xhr.onload = function () {
        try {
            const json = JSON.parse(this.responseText);
            console.log("Fetched " + json.results.length + " launches.");

            sendNextMessage(json.results, 0);
        } catch (e) {
            console.log("Error parsing JSON: " + e);
        }
    };

    xhr.onerror = function () {
        console.log('Network request failed');
    };

    xhr.open('GET', url);
    xhr.send();
}

function sendNextMessage(items, index) {
    if (index >= items.length) {
        console.log("All messages sent successfully!");
        return;
    }


    var item = items[index];
    var missionType = (item.mission && item.mission.type) ? item.mission.type : "Launch";
    var itemName = (item.name).toString();
    var index = itemName.indexOf("|");
    if (index != -1) {
        var name = itemName.slice(0, index);
    }

    const pinData = {
        "id": item.id,
        "time": item.net,
        "layout": {
            "type": "genericPin",
            "title": name,
            "tinyIcon": "system://images/NOTIFICATION_FLAG",
            "body": "Mission: " + item.mission.name + "\n \n Misson Descrip:\n" + item.mission.description
        }
    };
    pushTimelinePin(pinData);
    const cSeconds = Math.floor(new Date(item.net).getTime() / 1000);
    var dict = {
        'LaunchDate': cSeconds,
        'LaunchName': item.name,
        'LaunchID': item.id
    };

    Pebble.sendAppMessage(dict, function () {
        console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + item.id);
        sendNextMessage(items, index + 1);
    }, function (e) {
        console.log('Message ' + index + ' failed: ' + JSON.stringify(e));
    });

}

function sendErrorMessage(message) {
    var dict = {
        'ErrorData': message
    }
    Pebble.sendAppMessage(dict);
}

const PEBBLE_TIMELINE_URL = 'https://timeline-api.rebble.io/v1/user/pins';


function pushTimelinePin(pinData) {
    if (USER_TOKEN != null) {
        console.log('Cannot push pin: USER_TOKEN is missing.');
        Pebble.getTimelineToken(
            function (token) {
                console.log('Successfully obtained timeline token: ' + token);

                USER_TOKEN = token;
                console.log(USER_TOKEN);

            },
            function (error) {
                console.log('Error getting timeline token: ' + error);
                sendErrorMessage(error);
                return;
            });

    }
    var xhr = new XMLHttpRequest();
    var url = PEBBLE_TIMELINE_URL + '/' + pinData.id;

    xhr.open('PUT', url, true);

    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', USER_TOKEN);

    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            console.log('Success: Pin successfully pushed to the timeline.');
        } else {
            console.log('Error ' + xhr.status + ': ' + xhr.responseText);
            sendErrorMessage(xhr.responseText.toString() + " User token: " + USER_TOKEN);
        }
    };

    xhr.onerror = function () {
        console.log('Network error occurred while trying to push the pin.');
    };

    xhr.send(JSON.stringify(pinData));
}

