(function () {
    "use strict";

    function setStatus(message) {
        var status = document.getElementById("boot-status");
        if (status) {
            status.textContent = message;
        }
    }

    function removeStatus() {
        var status = document.getElementById("boot-status");
        if (status && status.parentNode) {
            status.parentNode.removeChild(status);
        }
    }

    function start() {
        if (typeof initDesktopHtml !== "function") {
            setStatus("ActionMoneySlot bootstrap is not available.");
            return;
        }

        try {
            setStatus("Starting ActionMoneySlot…");
            initDesktopHtml(window.ActionMoneySlotBootstrapConfig || {});
            removeStatus();
        } catch (error) {
            console.error("Failed to start ActionMoneySlot.", error);
            setStatus("ActionMoneySlot could not start. Check the browser console for details.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
