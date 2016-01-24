/*global require,module*/
var WebSocket = require('faye-websocket');

var Service, Characteristic, types;
var hsDevices = Object.create(null);

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    types = homebridge.hapLegacyTypes;
    homebridge.registerPlatform("homebridge-homeseer-websocket", "homeseer-websocket", HSPlatform);
};
module.exports.platform = HSPlatform;

function HSPlatform(log, config) {
    this.log = log;
    this._config = config;
    this._host = config.host;
    this._port = config.port;
    // this.username = config.username;
    // this.password = config.password;
    // this.elkEnabled = config.elkEnabled;
    // this.debugLoggingEnabled = (config.debugLoggingEnabled==undefined) ? false : config.debugLoggingEnabled;
    // this.includeAllScenes = (config.includeAllScenes==undefined) ? false : config.includeAllScenes;
    // this.includedScenes = (config.includedScenes==undefined) ? [] : config.includedScenes;
    this.reconnect();
}

function HomeSeerAccessoryBaseSetup(accessory, hs, id, device) {
    accessory.log = hs.log;
    accessory.device = device;
    accessory.address = id;
    accessory.name = accessory.device.location2 + " " + accessory.device.location + " " + accessory.device.name;
    accessory.uuid_base = id;
    accessory._ws = hs._ws;
    accessory.request = hs.request.bind(hs);

    hsDevices[id] = accessory;
}

function HomeSeerLight(hs, id, device) {
    HomeSeerAccessoryBaseSetup(this, hs, id, device);
    this.dimmable = this.device.values["1"] === "Dim 1%";

}

HomeSeerLight.prototype = {
    log: undefined,
    request: undefined,
    // _pending: undefined,
    _getOn: function(callback) {
        this.log("geton " + this.name);
        this.log(this.device.value);
        callback(null, this.device.value.value > 0);
    },
    _setOn: function(on, callback) {
        if (on && this.device.value.value > 0) {
            callback();
            return;
        }
        if (!on && this.device.value.value === 0) {
            callback();
            return;
        }
        this.log("seton " + on + " " + this.name);
        this.request({ type: "set", address: this.address, value: on ? 255 : 0 }, function() {
            callback();
        });
        // this._pending = function(val) {
        //     callback();
        // };
    },
    _getDim: function(callback) {
        this.log("getdim " + this.name);
        this.log(this.device.value);
        callback(null, this.device.value.value);
    },
    _setDim: function(level, callback) {
        var val = level;
        if (val > 99)
            val = 99;
        if (this.device.value.value === val) {
            callback();
            return;
        }
        this.log("setdim " + val + " " + this.name);
        this.request({ type: "set", address: this.address, value: val }, function() {
            callback();
        });
        // this._pending = function(val) {
        //     callback();
        // };
    },
    identify: function(callback) {
        callback();
    },
    getServices: function() {
        // {"name":"Front Lights","location":"Outside","location2":"1st floor","userNote":"","value":{"text":"","value":0},"values":{"0":"Off","255":"On"},"changed":"2016-01-19T14:19:04.543574-08:00"}
        // {"name":"Lights","location":"Stairs","location2":"1st floor","userNote":"","value":{"text":"","value":53},"values":{"0":"Off","1":"Dim 1%","99":"On","255":"On Last Level"},"changed":"2016-01-21T21:51:31.120226-08:00"}
        var info = new Service.AccessoryInformation();
        info.setCharacteristic(Characteristic.Manufacturer, "SmartHome");
        info.setCharacteristic(Characteristic.Model, this.name);
        info.setCharacteristic(Characteristic.SerialNumber, this.address);

        var light = new Service.Lightbulb();
        light.getCharacteristic(Characteristic.On).on("set", this._setOn.bind(this));
        light.getCharacteristic(Characteristic.On).on("get", this._getOn.bind(this));
        if (this.dimmable) {
            light.addCharacteristic(Characteristic.Brightness).on("set", this._setDim.bind(this));
            light.getCharacteristic(Characteristic.Brightness).on("get", this._getDim.bind(this));
        }

        this.informationService = info;
        this.lightService = light;

        return [info, light];
    },
    update: function(val) {
        this.device.value = val;
        // if (this._pending) {
        //     this._pending(val);
        //     this._pending = undefined;
        // } else {
            this.lightService.setCharacteristic(Characteristic.On, val.value > 0);
            this.lightService.setCharacteristic(Characteristic.Brightness, val.value);
        // }
    }
};

HSPlatform.prototype = {
    _ws: undefined,
    _id: 0,
    _cbs: Object.create(null),
    _ons: Object.create(null),
    _devices: undefined,
    _state: {},

    _processDevices(cb) {
        var devs = this._devices;
        var results = [];
        for (var id in devs) {
            //this.log("hey, processing device " + id);
            if (devs[id].name.indexOf("Lights") !== -1) {
                this.log(JSON.stringify(devs[id]));
                var dev = new HomeSeerLight(this, id, devs[id]);
                results.push(dev);
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
            // } else if (data.type === "devices") {
            //     // update device list and emit
            //     that._devices = data.devices;
            //     that._callOn("devices", data.devices);
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
