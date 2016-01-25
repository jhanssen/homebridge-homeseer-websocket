```
    "platforms": [
        {
            "platform" : "homeseer-websocket",
            "name" : "HomeSeer-WebSocket",
            "host": "localhost",
            "port": 8087,
            "types": [
                {
                    "type": "Lightbulb",
                    "key": "name",
                    "regex": "Lights"
                },
                {
                    "type": "Thermostat",
                    "key": "name",
                    "regex": "Thermostat",
                    "characteristics": [
                        {
                            "type": "CurrentTemperature",
                            "key": "name",
                            "regex": "Temperature",
                            "accessors": "get",
                            "convert": {
                                "from": "return arguments[0]*9/5+32;",
                                "to": "return (arguments[0]-32)*5/9"
                            }
                        },
                        {
                            "type": "CurrentHeatingCoolingState",
                            "key": "name",
                            "regex": "^Mode",
                            "accessors": "get"
                        },
                        {
                            "type": "TargetTemperature",
                            "key": "name",
                            "regex": "(Heating|Cooling).+Setpoint",
                            "accessors": "get,set",
                            "choose": "var mode = this.utils.find(this.device.associations, /^Mode$/); if (mode.value.value === 1 && arguments[0].name.indexOf('Heat') !== -1) return true; if (mode.value.value === 2 && arguments[0].name.indexOf('Cool') !== -1) return true; return false;",
                            "convert": {
                                "from": "return arguments[0]*9/5+32;",
                                "to": "return (arguments[0]-32)*5/9"
                            },
                            "use": "var mode = this.utils.find(this.device.associations, /^Mode$/); if (mode.value.value === 1) return 11; if (mode.value.value === 2) return 12; return 255;"
                        },
                        {
                            "type": "TargetHeatingCoolingState",
                            "key": "name",
                            "regex": "^Mode",
                            "accessors": "get,set"
                        }
                    ]
                }
            ]
        }
    ]
```
