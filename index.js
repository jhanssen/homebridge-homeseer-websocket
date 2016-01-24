/*global require,module*/
var WebSocket = require('faye-websocket');
var DeviceConstructors = Object.create(null);
var Service, Characteristic, Types;
var hsDevices = Object.create(null);

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Types = homebridge.hapLegacyTypes;
    homebridge.registerPlatform("homebridge-homeseer-websocket", "homeseer-websocket", HSPlatform);

    DeviceConstructors["Lightbulb"] = (function() {
        var hslight = require('./light.js');
        hslight.init(Service, Characteristic, Types);
        return hslight.HomeSeerLight;
    })();
};
module.exports.platform = HSPlatform;

function HSPlatform(log, config) {
    this.log = log;
    this._config = config;
    this._host = config.host;
    this._port = config.port;
    this._types = config.types;
    // this.username = config.username;
    // this.password = config.password;
    // this.elkEnabled = config.elkEnabled;
    // this.debugLoggingEnabled = (config.debugLoggingEnabled==undefined) ? false : config.debugLoggingEnabled;
    // this.includeAllScenes = (config.includeAllScenes==undefined) ? false : config.includeAllScenes;
    // this.includedScenes = (config.includedScenes==undefined) ? [] : config.includedScenes;
    this.reconnect();
}

HSPlatform.prototype = {
    _ws: undefined,
    _id: 0,
    _cbs: Object.create(null),
    _ons: Object.create(null),
    _devices: undefined,
    _state: {},

    _processDevices(cb) {
        var typeMatch = function(dev, type) {
            var k = type.key || "name";
            if ("regex" in type) {
                return (dev[k] + "").match(new RegExp(type.regex));
            } else if ("match" in type) {
                return (dev[k] + "").indexOf(type.match) !== -1;
            } else if ("exact" in type) {
                return dev[k] == type.exact;
            }
            return false;
        };

        var devs = this._devices;
        var results = [];
        for (var id in devs) {
            // this.log("hey, processing device " + id);
            // find a type that matches the device
            for (var tidx = 0; tidx < this._types.length; ++tidx) {
                if (typeMatch(devs[id], this._types[tidx])) {
                    // this.log("got device " + this._types[tidx].type);
                    var dev = new DeviceConstructors[this._types[tidx].type](this, id, devs[id]);
                    hsDevices[id] = dev;
                    results.push(dev);
                }
            }
        }
        cb(results);
    },

    reconnect: function reconnect() {
        var host = this._host;
        if (this._port !== undefined)
            host += ":" + this._port;
        this._ws = new WebSocket.Client("ws://" + host + "/homeseer");
        var that = this;
        this._ws.on('open', function(event) {
            that.log("got open, requesting devices");
            that.request("devices", function(data) {
                that.log(data);
                that._devices = data.devices;
                if (that._state.accessoriesCb) {
                    that._processDevices(that._state.accessoriesCb);
                    delete that._state.accessoriesCb;
                }
            });
        });
        this._ws.on('message', function(event) {
            that.log("got message");
            try {
                var data = JSON.parse(event.data);
            } catch (e) {
                that.log(e);
                return;
            }
            that.log(data);
            if (data.hasOwnProperty("id")) {
                if (data.hasOwnProperty("type") && data.hasOwnProperty("data")) {
                    if (data.type === "request") {
                        var ret = that._callOn("request", data.data);
                        if (ret !== undefined) {
                            var resp = { id: data.id, type: "response", data: ret };
                            that._ws.send(JSON.stringify(resp));
                        }
                        return;
                    }
                }
                if (data.id in that._cbs) {
                    var cb = that._cbs[data.id];
                    delete that._cbs[data.id];
                    cb(data);
                }
            } else if (data.type === "change") {
                if (data.change.address in hsDevices) {
                    var dev = hsDevices[data.change.address];
                    dev.update(data.change.value);
                }
            }
        });
        this._ws.on('close', function(event) {
            that.log("Got websocket close " + JSON.stringify(event.data));
            that._ws = undefined;
        });
        this._ws.on('error', function(event) {
            that.log("Got websocket error " + JSON.stringify(event.data));
        });
    },
    _callOn: function(type, arg) {
        if (type in this._ons) {
            var cb = this._ons[type];
            return cb(arg);
        }
        return undefined;
    },
    on: function(type, cb) {
        this._ons[type] = cb;
    },
    request: function request(req, cb) {
        var r;
        if (typeof req === "object") {
            r = req;
        } else {
            r = { type: req };
        }
        if (cb) {
            var id = ++this._id;
            r.id = id;
            this._cbs[id] = cb;
        }
        var data = JSON.stringify(r);
        this.log("sending " + data);
        this._ws.send(data);
    },
    accessories: function(cb) {
        if (this._devices !== undefined) {
            this._processDevices(cb);
        } else {
            this._state.accessoriesCb = cb;
        }
    }
};
