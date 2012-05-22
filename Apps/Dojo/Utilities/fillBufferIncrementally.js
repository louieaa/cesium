/*global define*/
define(['./incrementalGet'], function(incrementalGet) {
    "use strict";

    function fillBufferIncrementally(buffer, url, doneCallback) {
        return incrementalGet(url, function(item) {
            buffer.processCzml(item, url);
        }, doneCallback);
    }

    return fillBufferIncrementally;
});