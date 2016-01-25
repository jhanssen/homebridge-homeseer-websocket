/*global module*/
var match = function(dev, type) {
    if (type instanceof RegExp) {
        type = { regex: type };
    } else if (typeof type === "string") {
        type = { exact: type };
    }

    if (typeof type === "object") {
        var k = type.key || "name";
        if ("regex" in type) {
            var rx = type.regex;
            if (!(rx instanceof RegExp))
                rx = new RegExp(rx);
            return (dev[k] + "").match(rx);
        } else if ("match" in type) {
            return (dev[k] + "").indexOf(type.match) !== -1;
        } else if ("exact" in type) {
            return dev[k] == type.exact;
        }
    }
    return false;
};

var find = function(devices, type) {
    for (var i = 0; i < devices; ++i) {
        if (match(devices[i], type))
            return devices[i];
    }
    return null;
};

module.exports = {
    match: match,
    find: find
};
