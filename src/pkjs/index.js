const moddableProxy = require("@moddable/pebbleproxy");
var USER_TOKEN = null;
var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig);
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
});
Pebble.addEventListener('appmessage', function (e) {
    var dict = e.payload;
    if (dict && dict['FetchData'] !== undefined) {



        fetchData(getClaySetting("Launches"), getClaySetting("Events"));
    }
    else if (dict && dict['Subscribe'] !== undefined) {
        timeline_subscribe();
    }
});

function getClaySetting(keyName) {
    try {
        var settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
        return settings[keyName];
    } catch (e) {
        console.log('Error parsing Clay settings: ' + e);
        return null;
    }
}

Pebble.addEventListener('webviewclosed', function (e) {
    if (e && e.response) {
        console.log(getClaySetting("wkut"));
        var dict = {
            'updatewkut': getClaySetting("wkut")
        }
        Pebble.sendAppMessage(dict);
    }
});

function timeline_subscribe() {
    var xhr = new XMLHttpRequest();
    console.log("subscribing pebble");
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

function fetchData(launches, events) {
    console.log(launches, events);
    var pendingRequests = 0;
    if (launches || launches == "true") pendingRequests++;
    if (events || events == "true") pendingRequests++;

    function checkCompletion() {
        pendingRequests--;
        if (pendingRequests <= 0) {
            var dict = {
                'FinishedUpdates': "True"
            };
            Pebble.sendAppMessage(dict);
            console.log("All requests finished. Sent FinishedUpdates to watch.");
        }
    }

    if (pendingRequests === 0) {
        var dict = { 'FinishedUpdates': "True" };
        Pebble.sendAppMessage(dict);
        return;
    }

    if (launches || launches == "true") {
        var launchURL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json";
        var launchXHR = new XMLHttpRequest();

        launchXHR.onload = function () {
            try {
                const json = JSON.parse(this.responseText);
                if (json.results != null) {
                    console.log("Fetched " + json.results.length + " launches.");
                    sendNextLaunchMessage(json.results, 0);
                } else {
                    sendErrorMessage(json.detail);
                }
            } catch (e) {
                console.log("Error parsing launch JSON: " + e);
            }
            checkCompletion();
        };

        launchXHR.onerror = function () {
            console.log('Network request failed');
            checkCompletion();
        };

        launchXHR.open('GET', launchURL);
        launchXHR.send();
    }

    if (events || events == "true") {
        var eventURL = "https://ll.thespacedevs.com/2.3.0/events/upcoming/?format=json";
        var eventXHR = new XMLHttpRequest();

        eventXHR.onload = function () {
            try {
                const json = JSON.parse(this.responseText);
                if (json.results != null) {
                    console.log("Fetched " + json.results.length + " events.");
                    sendNextEventMessage(json.results, 0);
                } else {
                    sendErrorMessage(json.detail);
                }
            } catch (e) {
                console.log("Error parsing event JSON: " + e);
            }
            checkCompletion();
        };

        eventXHR.onerror = function () {
            console.log('Network request failed');
            checkCompletion();
        };

        eventXHR.open('GET', eventURL);
        eventXHR.send();
    }
}

function sendNextLaunchMessage(items, index) {
    console.log("Sending message...");
    if (index >= items.length) {
        console.log("All messages sent successfully!");
        return;
    }


    var item = items[index];
    var missionType = (item.mission && item.mission.type) ? item.mission.type : "Launch";
    var itemName = (item.name).toString();
    var idx = itemName.indexOf("|");
    if (idx != -1) {
        var name = itemName.slice(0, idx);
    }

    const pinData = {
        "id": item.id,
        "time": item.net,
        "layout": {
            "type": "genericPin",
            "title": name,
            "tinyIcon": "app://images/TL_ICON",
            "smallIcon": "app://images/TL_ICON",
            "largeIcon": "app://images/TL_ICON",
            "body": "Mission: " + item.mission.name + "\n \nMisson Description:\n" + item.mission.description
        }
    };
    pushTimelinePin(pinData);
    const cSeconds = Math.floor(new Date(item.net).getTime() / 1000);

    console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + item.id);
    sendNextLaunchMessage(items, index + 1);

}

function sendNextEventMessage(items, index) {
    console.log("Sending message...");
    if (index >= items.length) {
        console.log("All messages sent successfully!");
        return;
    }


    var item = items[index];
    var name = (item.name).toString();

    const pinData = {
        "id": item.id,
        "time": item.date,
        "layout": {
            "type": "genericPin",
            "title": name,
            "tinyIcon": "system://images/TIMELINE_CALENDAR",
            "body": "Event Description:\n" + item.description
        }
    };
    pushTimelinePin(pinData);
    const cSeconds = Math.floor(new Date(item.date).getTime() / 1000);

    console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + item.id);
    sendNextEventMessage(items, index + 1);

}

function sendErrorMessage(message) {
    var dict = {
        'ErrorData': message
    }
    Pebble.sendAppMessage(dict);
}

function sendErrorMessage(message) {
    var dict = {
        'ErrorData': message
    }
    Pebble.sendAppMessage(dict);
}

const PEBBLE_TIMELINE_URL = 'https://timeline-api.rebble.io/v1/user/pins';


function pushTimelinePin(pinData) {
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

