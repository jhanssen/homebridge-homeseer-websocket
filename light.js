/*global module*/

var Service, Characteristic;

function HomeSeerLight(hs, id, device) {
    this.log = hs.log;
    this.device = device;
    this.address = id;
    this.name = this.device.location2 + " " + this.device.location + " " + this.device.name;
    this.uuid_base = id;
    this._ws = hs._ws;
    this.request = hs.request.bind(hs);
    this.dimmable = this.device.values["1"] === "Dim 1%";
}

HomeSeerLight.prototype = {
    log: undefined,
    request: undefined,
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
        this.lightService.setCharacteristic(Characteristic.On, val.value > 0);
        this.lightService.setCharacteristic(Characteristic.Brightness, val.value);
    }
};

module.exports = {
    Light: HomeSeerLight,
    init: function(service, characteristic) {
        Service = service;
        Characteristic = characteristic;
    }
};
