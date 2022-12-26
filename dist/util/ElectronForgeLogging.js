"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pluginName = 'ElectronForgeLogging';
class LoggingPlugin {
    constructor(tab) {
        this.tab = tab;
    }
    apply(compiler) {
        compiler.hooks.done.tap(pluginName, (stats) => {
            if (stats) {
                this.tab.log(stats.toString({
                    colors: true,
                }));
            }
        });
        compiler.hooks.failed.tap(pluginName, (err) => this.tab.log(err.message));
        compiler.hooks.infrastructureLog.tap(pluginName, (name, _type, args) => {
            this.tab.log(`${name} - ${args.join(' ')}\n`);
            return true;
        });
    }
}
exports.default = LoggingPlugin;
//# sourceMappingURL=ElectronForgeLogging.js.map