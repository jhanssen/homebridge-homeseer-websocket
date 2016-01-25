/*global module,require*/

var utils = require("./utils.js");
var Service, Characteristic;

function HomeSeerThermostat(hs, id, device, type) {
    this.log = hs.log;
    this.device = device;
    this.address = id;
    this.type = type;
    this.name = this.device.location2 + " " + this.device.location + " " + this.device.name;
    this.uuid_base = id;
    this._ws = hs._ws;
    this.request = hs.request.bind(hs);
    this.dimmable = this.device.values["1"] === "Dim 1%";
    this._processType();
}

HomeSeerThermostat.prototype = {
    log: undefined,
    request: undefined,
    _updates: Object.create(null),

    _processType: function() {
        if (this.type.characteristics instanceof Array) {
            for (var i = 0; i < this.type.characteristics.length; ++i) {
                var c = this.type.characteristics[i];
                if ("choose" in c) {
                    c.choose = new Function(c.choose).bind(this);
                }
                if ("convert" in c) {
                    c.convert.to = new Function(c.convert.to).bind(this);
                    c.convert.from = new Function(c.convert.from).bind(this);
                }
            }
        }
    },

    _choose: function(children, func) {
        if (children instanceof Array) {
            if (children.length > 1) {
                for (var i = 0; i < children.length; ++i) {
                    if (func(children[i]))
                        return children[i];
                }
            }
            return children[0];
        }
        return children;
    },
    _get: function(children, choose, convert, callback) {
        var chosen = this._choose(children, choose);
        var value;
        if (convert)
            value = convert.to(chosen.value.value);
        else
            value = chosen.value.value;
        callback(null, value);
    },
    _set: function(children, choose, convert, value, callback) {
        var chosen = this._choose(children, choose);
        if (value == chosen.value.value)
            return;
        if (convert)
            value = convert.from(value);
        this.request({ type: "set", address: chosen.address, value: value }, function() {
            callback();
        });
    },
    identify: function(callback) {
        callback();
    },
    getServices: function() {
        /*
         {"name": "Thermostat", "location": "Living Room", "location2": "1st floor", "userNote": "", "value": { "text": "No Status", "value": 0 },
          "values": {}, "changed": "0001-01-01T00:00:00", "uses": [], "relationship": 0, "associations": ["EB90B19B-004-Q8", "EB90B19B-004-Q9", ...]},
         {"name": "Temperature", "location": "Living Room", "location2": "1st floor", "userNote": "", "value": {"text": "", "value": 70 },
          "values": {"-2147483648": "-2147483648 F"}, "changed": "2016-01-24T13:23:08.957829-08:00", "uses": [255], "relationship": 1,
          "associations": ["EB90B19B-004"]},
        */
        var info = new Service.AccessoryInformation();
        info.setCharacteristic(Characteristic.Manufacturer, "SmartHome");
        info.setCharacteristic(Characteristic.Model, this.name);
        info.setCharacteristic(Characteristic.SerialNumber, this.address);

        var setupCharacteristic = function(service, characteristic, children) {
            if (characteristic.accessors.indexOf("get") !== -1) {
                service
                    .getCharacteristic(Characteristic[characteristic.type])
                    .on("get", this._get.bind(this, children, characteristic.choose, characteristic.convert));
            }
            if (characteristic.accessors.indexOf("set") !== -1) {
                service
                    .getCharacteristic(Characteristic[characteristic.type])
                    .on("get", this._set.bind(this, children, characteristic.choose, characteristic.convert));
            }
            for (var i = 0; i < children.length; ++i) {
                var setter = function(val) {
                    this.value = val;

                    var value = val.value;
                    if (characteristic.convert)
                        value = characteristic.convert.to(value);
                    service.setCharacteristic(Characteristic[characteristic.type], value);
                };
                this._updates[children[i].address] = setter.bind(children[i]);
            }
        };

        var thermostat = new Service.Thermostat();
        // go through all children and set up characteristics
        for (var i = 0; i < this.type.characteristics.length; ++i) {
            // match type with child device
            var characteristic = this.type.characteristics[i];
            var candidates = [];
            var children = this.device.associations;
            for (var j = 0; j < children.length; ++j) {
                if (utils.match(children[j], characteristic)) {
                    candidates.push(children[j]);
                }
            }
            if (candidates.length > 0) {
                setupCharacteristic.call(this, thermostat, characteristic, candidates);
            }
        }

        this.informationService = info;
        this.thermostatService = thermostat;

        return [info, thermostat];
    },
    update: function(addr, val) {
        if (addr in this._updates)
            this._updates[addr](val);
    }
};

module.exports = {
    HomeSeerThermostat: HomeSeerThermostat,
    init: function(service, characteristic) {
        Service = service;
        Characteristic = characteristic;
    }
};
