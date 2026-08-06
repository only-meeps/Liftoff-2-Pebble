const moddableProxy = require("@moddable/pebbleproxy");
var USER_TOKEN = null;
var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var dynamicClay = require('./dynamic-clay.js');
var clay = new Clay(clayConfig, dynamicClay);
const SERVER_URL = ""
const EU_COUNTRY_CODES = new Set([
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK"
]);
Pebble.addEventListener('ready', moddableProxy.readyReceived);
Pebble.addEventListener('appmessage', moddableProxy.appMessageReceived);
var euL;
var usaL;
var chinaL;
var rusL;
var jpnL;
var indL;
var otherL;

function initializeClayDefaults(config) {
    var settings = {};

    try {
        settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
    } catch (e) {
        settings = {};
    }

    var updated = false;

    function processItem(item) {
        if (!item) return;
        if (item.messageKey && item.defaultValue !== undefined) {
            if (settings[item.messageKey] === undefined || settings[item.messageKey] === null) {
                settings[item.messageKey] = item.defaultValue;
                updated = true;
            }
        }

        if (item.items && Array.isArray(item.items)) {
            item.items.forEach(processItem);
        }
    }
    if (Array.isArray(config)) {
        config.forEach(processItem);
    }

    if (updated) {
        localStorage.setItem('clay-settings', JSON.stringify(settings));
        console.log("Initialized missing Clay default settings into localStorage.");
    }
}

Pebble.addEventListener('ready', function () {
    console.log('PebbleKit JS ready!');
    initializeClayDefaults(clayConfig);
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

    euL = getClaySetting("EUSub");
    usaL = getClaySetting("USASub");
    chinaL = getClaySetting("ChinaSub");
    rusL = getClaySetting("RUSSub");
    jpnL = getClaySetting("JPNSub");
    indL = getClaySetting("INDSub");
    otherL = getClaySetting("OTHERSub");
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
        console.log(getClaySetting("hourlywkut"));
        var dict = {
            'updatewkut': getClaySetting("wkut"),
            'hourlywkut': getClaySetting("hourlywkut")
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
    var error = 0;
    if (launches || launches == "true") pendingRequests++;
    if (events || events == "true") pendingRequests++;

    function checkCompletion() {
        pendingRequests--;
        if (pendingRequests <= 0 && error == 0) {
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
                    if (localStorage.getItem("launches") != null) {
                        console.log("Checking for canceled launches...");
                        const storedLaunches = JSON.parse(localStorage.getItem("launches"));
                        for (var i = 0; i < storedLaunches.results.length; i++) {
                            const exists = json.results.some(x => x.id === storedLaunches.results[i].id);

                            if (!exists) {
                                console.log("Placeholder for deleting pin: " + storedLaunches.results[i].id)
                                //deletePin(storedLaunches.results[i].id);
                            }
                        }
                        console.log("Finished checking for canceled launches.");
                    }
                    else {
                        console.log("No launch records in storage. Skipping check...");
                    }


                    localStorage.setItem("launches", this.responseText);
                    console.log("Fetched " + json.results.length + " launches.");
                    var reminderTime = getClaySetting("LaunchReminders");
                    if (reminderTime > 0) {
                        sendNextLaunchMessage(json.results, 0, true, reminderTime);
                    }
                    else {
                        sendNextLaunchMessage(json.results, 0, false, 0);
                    }

                } else {
                    error = 1;
                    sendErrorMessage(json.detail);
                }
            } catch (e) {
                error = 2;
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
    else {
        if (localStorage.getItem("launches") != null) {
            const storedLaunches = JSON.parse(localStorage.getItem("launches"));
            for (var i = 0; i < storedLaunches.results.length; i++) {
                deletePin(storedLaunches.results[i].id);
            }
        }
    }
    if (events || events == "true") {
        var eventURL = "https://ll.thespacedevs.com/2.3.0/events/upcoming/?format=json";
        var eventXHR = new XMLHttpRequest();

        eventXHR.onload = function () {
            try {
                const json = JSON.parse(this.responseText);
                if (json.results != null) {
                    if (localStorage.getItem("events") != null) {
                        console.log("Checking for canceled events...");
                        const storedEvents = JSON.parse(localStorage.getItem("events"));
                        for (var i = 0; i < storedEvents.results.length; i++) {
                            const exists = json.results.some(x => x.id === storedEvents.results[i].id);

                            if (!exists) {
                                console.log("Placeholder for deleting pin: " + storedLaunches.results[i].id)
                                //deletePin(storedEvents.results[i].id);
                            }
                        }
                        console.log("Finished checking for canceled events.");
                    }
                    else {
                        console.log("No event records in storage. Skipping check...");
                    }


                    localStorage.setItem("events", this.responseText);
                    console.log("Fetched " + json.results.length + " events.");
                    var reminderTime = getClaySetting("EventReminders");
                    if (reminderTime > 0) {
                        sendNextEventMessage(json.results, 0, true, reminderTime);
                    } else {
                        sendNextEventMessage(json.results, 0, false, 0);
                    }
                } else {
                    error = 1;
                    sendErrorMessage(json.detail);
                }
            } catch (e) {
                error = 2;
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
    else {
        if (localStorage.getItem("events") != null) {
            const storedEvents = JSON.parse(localStorage.getItem("events"));
            for (var i = 0; i < storedEvents.results.length; i++) {
                deletePin(storedEvents.results[i].id);
            }
        }
    }
}

function deletePin(id) {
    var xhr = new XMLHttpRequest();
    var url = PEBBLE_TIMELINE_URL + '/' + id;

    xhr.open('DELETE', url, true);

    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', USER_TOKEN);

    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            console.log('Success: Pin successfully deleted from the timeline.');
        } else {
            console.log('Error ' + xhr.status + ': ' + xhr.responseText);
            sendErrorMessage(xhr.responseText.toString() + " User token: " + USER_TOKEN);
        }
    };

    xhr.onerror = function () {
        console.log('Network error occurred while trying to delete the pin.');
    };
    xhr.send();
}

function sendNextLaunchMessage(items, index, reminder, reminderTime) {
    console.log("Sending message...");
    if (index >= items.length) {
        console.log("All messages sent successfully!");
        return;
    }


    var item = items[index];
    var missionType = (item.mission && item.mission.type) ? item.mission.type : "Launch";
    var itemName = (item.name).toString();
    var idx = itemName.indexOf("|");
    var missionName = (item.mission && item.mission.name) ? item.mission.name : "No mission specified";
    var missionDesc = (item.mission && item.mission.description) ? item.mission.description : "No description available.";
    var locationName = (item.pad.location && item.pad.location.name) ? item.pad.location.name : "Unknown Location";

    if (!euL && EU_COUNTRY_CODES.has(item.pad.country.alpha_2_code)) {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!usaL && item.pad.country.alpha_2_code == "US") {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!chinaL && item.pad.country.alpha_2_code == "CN") {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!rusL && item.pad.country.alpha_2_code == "RS") {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!indL && item.pad.country.alpha_2_code == "IN") {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!jpnL && item.pad.country.alpha_2_code == "JP") {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!otherL) {
        if (reminder) {
            sendNextLaunchMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextLaunchMessage(items, index + 1, false, 0);
        }
        return;
    }

    if (idx != -1) {
        var name = itemName.slice(0, idx);
    }
    if (reminder) {
        const date = new Date(item.net);

        date.setUTCMinutes(date.getUTCMinutes() - reminderTime);

        const updatedDateStr = date.toISOString();
        const pinData = {
            "id": String(item.id),
            "time": item.net,
            "layout": {
                "type": "genericPin",
                "title": name,
                "tinyIcon": "app://images/TL_ICON",
                "body": "Mission: " + missionName + "\n \nMisson Description:\n" + missionDesc,
                "subtitle": locationName,
                "lastupdated": new Date().toISOString()
            },
            "reminders": [
                {
                    "time": updatedDateStr,
                    "layout": {
                        "type": "genericReminder",
                        "tinyIcon": "app://images/TL_ICON",
                        "title": name + " takeoff in T-" + reminderTime + "m"
                    }
                }
            ],
            "actions": [
                {
                    "title": "Force update",
                    "type": "openWatchApp",
                    "launchCode": 1
                }
            ]
        };
        pushTimelinePin(pinData);
        const cSeconds = Math.floor(new Date(item.net).getTime() / 1000);

        console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + String(item.id) + " reminder: " + reminderTime + " minutes before");

        sendNextLaunchMessage(items, index + 1, true, reminderTime);
    }
    else {
        const pinData = {
            "id": String(item.id),
            "time": item.net,
            "layout": {
                "type": "genericPin",
                "title": name,
                "tinyIcon": "app://images/TL_ICON",
                "body": "Mission: " + missionName + "\n \nMisson Description:\n" + missionDesc,
                "subtitle": locationName,
                "lastupdated": new Date().toISOString()
            },
            "actions": [
                {
                    "title": "Force update",
                    "type": "openWatchApp",
                    "launchCode": 1
                }
            ]
        };
        pushTimelinePin(pinData);
        const cSeconds = Math.floor(new Date(item.net).getTime() / 1000);

        console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + String(item.id));
        sendNextLaunchMessage(items, index + 1, false, 0);
    }
}

function sendNextEventMessage(items, index, reminder, reminderTime) {
    console.log("Sending message...");
    if (index >= items.length) {
        console.log("All messages sent successfully!");
        return;
    }


    var item = items[index];
    var name = (item.name).toString();
    if (!euL && EU_COUNTRY_CODES.has(item.pad.country.alpha_2_code)) {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!usaL && item.pad.country.alpha_2_code == "US") {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!chinaL && item.pad.country.alpha_2_code == "CN") {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!rusL && item.pad.country.alpha_2_code == "RS") {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!indL && item.pad.country.alpha_2_code == "IN") {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!jpnL && item.pad.country.alpha_2_code == "JP") {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }
    else if (!otherL) {
        if (reminder) {
            sendNextEventMessage(items, index + 1, true, reminderTime);
        }
        else {
            sendNextEventMessage(items, index + 1, false, 0);
        }
        return;
    }

    if (reminder) {
        const date = new Date(item.date);

        date.setUTCMinutes(date.getUTCMinutes() - reminderTime);

        const updatedDateStr = date.toISOString();
        const pinData = {
            "id": String(item.id),
            "time": item.date,
            "layout": {
                "type": "genericPin",
                "title": name,
                "tinyIcon": "system://images/TIMELINE_CALENDAR",
                "body": "Event Description:\n" + item.description,
                "subtitle": item.location.name,
                "lastupdated": new Date().toISOString()
            },
            "reminders": [
                {
                    "time": updatedDateStr,
                    "layout": {
                        "type": "genericReminder",
                        "tinyIcon": "system://images/TIMELINE_CALENDAR",
                        "title": name + " happening soon!"
                    }
                }
            ],
            "actions": [
                {
                    "title": "Force update",
                    "type": "openWatchApp",
                    "launchCode": 1
                }
            ]
        };
        pushTimelinePin(pinData);
        const cSeconds = Math.floor(new Date(item.date).getTime() / 1000);

        console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + String(item.id) + " reminder: " + reminderTime + " minutes before");
        sendNextEventMessage(items, index + 1, true, reminderTime);
    }
    else {
        const pinData = {
            "id": String(item.id),
            "time": item.date,
            "layout": {
                "type": "genericPin",
                "title": name,
                "tinyIcon": "system://images/TIMELINE_CALENDAR",
                "body": "Event Description:\n" + item.description,
                "subtitle": item.location.name,
                "lastupdated": new Date().toISOString()
            },
            "actions": [
                {
                    "title": "Force update",
                    "type": "openWatchApp",
                    "launchCode": 1
                }
            ]
        };
        pushTimelinePin(pinData);
        const cSeconds = Math.floor(new Date(item.date).getTime() / 1000);

        console.log('Message ' + index + ' sent successfully: ' + item.name + " time: " + cSeconds + " id: " + String(item.id));
        sendNextEventMessage(items, index + 1, false, 0);
    }



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

