(function (window) {
    "use strict";

    function getStringParam(params, keys, fallback) {
        for (var i = 0; i < keys.length; i++) {
            var value = params.get(keys[i]);
            if (value !== null && value !== "") {
                return value;
            }
        }

        return fallback;
    }

    function getNumberParam(params, keys, fallback) {
        var value = getStringParam(params, keys, "");
        if (value === "") {
            return fallback;
        }

        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getBooleanParam(params, keys, fallback) {
        var value = getStringParam(params, keys, "");
        if (value === "") {
            return fallback;
        }

        return !/^(0|false|no)$/i.test(value);
    }

    var params = new URLSearchParams(window.location.search);
    var selectedGameName = getStringParam(params, ["gameName", "name"], "ORJSlot");

    window.gameName = selectedGameName;
    window.ActionMoneySlotBootstrapConfig = {
        sessionKey: getStringParam(params, ["sessionKey"], "INT:EUR:5000000:IPC:taenagent"),
        tcpHost: getStringParam(params, ["tcpHost", "host"], "mgs-demo.egtmgs.com"),
        tcpPort: getNumberParam(params, ["tcpPort", "port"], 8095),
        lang: getStringParam(params, ["lang", "language"], "en"),
        sslHost: getBooleanParam(params, ["sslHost", "secure"], true),
        gameIdentificationNumber: getNumberParam(params, ["gameIdentificationNumber"], -1),
        gameName: selectedGameName
    };
})(window);
