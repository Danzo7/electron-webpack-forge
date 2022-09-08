"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_ora_1 = require("@electron-forge/async-ora");
const once_1 = __importDefault(require("./once"));
const pluginName = 'ElectronForgeLogging';
class LoggingPlugin {
    constructor(tab) {
        this.tab = tab;
        this.promiseResolver = undefined;
        this.promiseRejector = undefined;
    }
    addRun() {
        if (this.promiseResolver)
            this.promiseResolver();
        (0, async_ora_1.asyncOra)('Compiling Renderer Code', () => new Promise((resolve, reject) => {
            const [onceResolve, onceReject] = (0, once_1.default)(resolve, reject);
            this.promiseResolver = onceResolve;
            this.promiseRejector = onceReject;
        }), () => {
            /* do not exit */
        });
    }
    finishRun(error) {
        if (error && this.promiseRejector)
            this.promiseRejector(error);
        else if (this.promiseResolver)
            this.promiseResolver();
        this.promiseRejector = undefined;
        this.promiseResolver = undefined;
    }
    apply(compiler) {
        compiler.hooks.watchRun.tap(pluginName, (_compiler) => {
            this.addRun();
        });
        compiler.hooks.done.tap(pluginName, (stats) => {
            if (stats) {
                this.tab.log(stats.toString({
                    colors: true,
                }));
                if (stats.hasErrors()) {
                    this.finishRun(stats.compilation.getErrors().toString());
                    return;
                }
            }
            this.finishRun();
        });
        compiler.hooks.failed.tap(pluginName, (err) => this.finishRun(err.message));
        compiler.hooks.infrastructureLog.tap(pluginName, (name, _type, args) => {
            this.tab.log(`${name} - ${args.join(' ')}\n`);
            return true;
        });
    }
}
exports.default = LoggingPlugin;
//# sourceMappingURL=ElectronForgeLogging.js.map