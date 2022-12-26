"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNoWindow = exports.isPreloadOnly = exports.isLocalWindow = void 0;
/**
 * Reusable type predicate functions to narrow down the type of the WebpackPluginEntryPoint
 */
const isLocalWindow = (entry) => {
    return !!entry.html;
};
exports.isLocalWindow = isLocalWindow;
const isPreloadOnly = (entry) => {
    return !entry.html && !entry.js && !!entry.preload;
};
exports.isPreloadOnly = isPreloadOnly;
const isNoWindow = (entry) => {
    return !entry.html && !!entry.js;
};
exports.isNoWindow = isNoWindow;
//# sourceMappingURL=rendererTypeUtils.js.map