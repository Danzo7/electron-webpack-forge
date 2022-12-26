"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebpackPlugin = void 0;
const path_1 = __importDefault(require("path"));
const core_utils_1 = require("@electron-forge/core-utils");
const plugin_base_1 = require("@electron-forge/plugin-base");
const web_multi_logger_1 = __importDefault(require("@electron-forge/web-multi-logger"));
const chalk_1 = __importDefault(require("chalk"));
const debug_1 = __importDefault(require("debug"));
const fs_extra_1 = __importStar(require("fs-extra"));
const webpack_1 = __importDefault(require("webpack"));
const webpack_dev_server_1 = __importDefault(require("webpack-dev-server"));
const webpack_merge_1 = require("webpack-merge");
const ElectronForgeLogging_1 = __importDefault(require("./util/ElectronForgeLogging"));
const once_1 = __importDefault(require("./util/once"));
const rendererTypeUtils_1 = require("./util/rendererTypeUtils");
const WebpackConfig_1 = __importDefault(require("./WebpackConfig"));
const d = (0, debug_1.default)('electron-forge:plugin:webpack');
const DEFAULT_PORT = 3000;
const DEFAULT_LOGGER_PORT = 9000;
class WebpackPlugin extends plugin_base_1.PluginBase {
    constructor(c) {
        super(c);
        this.name = 'webpack';
        this.isProd = false;
        this.watchers = [];
        this.servers = [];
        this.loggers = [];
        this.port = DEFAULT_PORT;
        this.loggerPort = DEFAULT_LOGGER_PORT;
        this.isValidPort = (port) => {
            if (port < 1024) {
                throw new Error(`Cannot specify port (${port}) below 1024, as they are privileged`);
            }
            else if (port > 65535) {
                throw new Error(`Port specified (${port}) is not a valid TCP port.`);
            }
            else {
                return true;
            }
        };
        this.exitHandler = (options, err) => {
            d('handling process exit with:', options);
            if (options.cleanup) {
                for (const watcher of this.watchers) {
                    d('cleaning webpack watcher');
                    watcher.close(() => {
                        /* Do nothing when the watcher closes */
                    });
                }
                this.watchers = [];
                for (const server of this.servers) {
                    d('cleaning http server');
                    server.close();
                }
                this.servers = [];
                for (const logger of this.loggers) {
                    d('stopping logger');
                    logger.stop();
                }
                this.loggers = [];
            }
            if (err)
                console.error(err.stack);
            // Why: This is literally what the option says to do.
            // eslint-disable-next-line no-process-exit
            if (options.exit)
                process.exit();
        };
        this.runWebpack = async (options, isRenderer = false) => new Promise((resolve, reject) => {
            (0, webpack_1.default)(options).run(async (err, stats) => {
                var _a;
                if (isRenderer && this.config.renderer.jsonStats) {
                    for (const [index, entryStats] of ((_a = stats === null || stats === void 0 ? void 0 : stats.stats) !== null && _a !== void 0 ? _a : []).entries()) {
                        const name = this.config.renderer.entryPoints[index].name;
                        await this.writeJSONStats('renderer', entryStats, options[index].stats, name);
                    }
                }
                if (err) {
                    return reject(err);
                }
                return resolve(stats);
            });
        });
        this.init = (dir) => {
            this.setDirectories(dir);
            d('hooking process events');
            process.on('exit', (_code) => this.exitHandler({ cleanup: true }));
            process.on('SIGINT', (_signal) => this.exitHandler({ exit: true }));
        };
        this.setDirectories = (dir) => {
            this.projectDir = dir;
            const pj = (0, fs_extra_1.readJsonSync)(path_1.default.resolve(this.projectDir, 'package.json'));
            if (!pj.name)
                throw new Error('The error');
            this.output = pj.main.split('/')[0];
            this.baseDir = path_1.default.resolve(dir, this.output);
        };
        this.resolveForgeConfig = async (forgeConfig) => {
            if (!forgeConfig.packagerConfig) {
                forgeConfig.packagerConfig = {};
            }
            if (forgeConfig.packagerConfig.ignore) {
                if (typeof forgeConfig.packagerConfig.ignore !== 'function') {
                    console.error(chalk_1.default.red(`You have set packagerConfig.ignore, the Electron Forge webpack plugin normally sets this automatically.

          Your packaged app may be larger than expected if you dont ignore everything other than the '${this.output}' folder`));
                }
                return forgeConfig;
            }
            forgeConfig.packagerConfig.ignore = (file) => {
                if (!file)
                    return false;
                if (this.config.jsonStats &&
                    file.endsWith(path_1.default.join(this.output, 'main', 'stats.json'))) {
                    return true;
                }
                if (this.config.renderer.jsonStats &&
                    file.endsWith(path_1.default.join(this.output, 'renderer', 'stats.json'))) {
                    return true;
                }
                if (!this.config.packageSourceMaps && /[^/\\]+\.js\.map$/.test(file)) {
                    return true;
                }
                return !new RegExp('^[/\\\\]' + this.output + '($|[/\\\\]).*$').test(file);
            };
            return forgeConfig;
        };
        this.packageAfterCopy = async (_forgeConfig, buildPath) => {
            var _a;
            const pj = await fs_extra_1.default.readJson(path_1.default.resolve(this.projectDir, 'package.json'));
            if (!((_a = pj.main) === null || _a === void 0 ? void 0 : _a.endsWith(this.output + '/main'))) {
                throw new Error(`Electron Forge is configured to use the Webpack plugin. The plugin expects the
"main" entry point in "package.json" to be "${this.output}/main" (where the plugin outputs
the generated files). Instead, it is ${JSON.stringify(pj.main)}`);
            }
            if (pj.config) {
                delete pj.config.forge;
            }
            await fs_extra_1.default.writeJson(path_1.default.resolve(buildPath, 'package.json'), pj, {
                spaces: 2,
            });
            await fs_extra_1.default.mkdirp(path_1.default.resolve(buildPath, 'node_modules'));
        };
        this.compileMain = async (watch = false, logger) => {
            let tab;
            if (logger) {
                tab = logger.createTab('Main Process');
            }
            const mainConfig = await this.configGenerator.getMainConfig();
            await new Promise((resolve, reject) => {
                const compiler = (0, webpack_1.default)(mainConfig);
                const [onceResolve, onceReject] = (0, once_1.default)(resolve, reject);
                const cb = async (err, stats) => {
                    if (tab && stats) {
                        tab.log(stats.toString({
                            colors: true,
                        }));
                    }
                    if (this.config.jsonStats) {
                        await this.writeJSONStats('main', stats, mainConfig.stats, 'main');
                    }
                    if (err)
                        return onceReject(err);
                    if (!watch && (stats === null || stats === void 0 ? void 0 : stats.hasErrors())) {
                        return onceReject(new Error(`Compilation errors in the main process: ${stats.toString()}`));
                    }
                    return onceResolve(undefined);
                };
                if (watch) {
                    this.watchers.push(compiler.watch({}, cb));
                }
                else {
                    compiler.run(cb);
                }
            });
        };
        this.compileRenderers = async (watch = false) => {
            const stats = await this.runWebpack(await this.configGenerator.getRendererConfig(this.config.renderer.entryPoints), true);
            if (!watch && (stats === null || stats === void 0 ? void 0 : stats.hasErrors())) {
                throw new Error(`Compilation errors in the renderer: ${stats.toString()}`);
            }
            for (const entryPoint of this.config.renderer.entryPoints) {
                if (((0, rendererTypeUtils_1.isLocalWindow)(entryPoint) && !!entryPoint.preload) ||
                    (0, rendererTypeUtils_1.isPreloadOnly)(entryPoint)) {
                    const stats = await this.runWebpack(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    [
                        await this.configGenerator.getPreloadConfigForEntryPoint(entryPoint),
                    ]);
                    if (stats === null || stats === void 0 ? void 0 : stats.hasErrors()) {
                        throw new Error(`Compilation errors in the preload (${entryPoint.name}): ${stats.toString()}`);
                    }
                }
            }
        };
        this.launchRendererDevServers = async (logger) => {
            const tab = logger.createTab('Renderers');
            const pluginLogs = new ElectronForgeLogging_1.default(tab);
            const config = await this.configGenerator.getRendererConfig(this.config.renderer.entryPoints);
            if (config.length === 0) {
                return;
            }
            for (const entryConfig of config) {
                if (!entryConfig.plugins)
                    entryConfig.plugins = [];
                entryConfig.plugins.push(pluginLogs);
                entryConfig.infrastructureLogging = {
                    level: 'none',
                };
                entryConfig.stats = 'none';
            }
            const compiler = (0, webpack_1.default)(config);
            const webpackDevServer = new webpack_dev_server_1.default(this.devServerOptions(), compiler);
            await webpackDevServer.start();
            this.servers.push(webpackDevServer.server);
            for (const entryPoint of this.config.renderer.entryPoints) {
                if (((0, rendererTypeUtils_1.isLocalWindow)(entryPoint) && !!entryPoint.preload) ||
                    (0, rendererTypeUtils_1.isPreloadOnly)(entryPoint)) {
                    const config = await this.configGenerator.getPreloadConfigForEntryPoint(entryPoint);
                    config.infrastructureLogging = {
                        level: 'none',
                    };
                    config.stats = 'none';
                    await new Promise((resolve, reject) => {
                        const tab = logger.createTab(`${entryPoint.name} - Preload`);
                        const [onceResolve, onceReject] = (0, once_1.default)(resolve, reject);
                        this.watchers.push((0, webpack_1.default)(config).watch({}, (err, stats) => {
                            if (stats) {
                                tab.log(stats.toString({
                                    colors: true,
                                }));
                            }
                            if (err)
                                return onceReject(err);
                            return onceResolve(undefined);
                        }));
                    });
                }
            }
        };
        this.alreadyStarted = false;
        if (c.port) {
            if (this.isValidPort(c.port)) {
                this.port = c.port;
            }
        }
        if (c.loggerPort) {
            if (this.isValidPort(c.loggerPort)) {
                this.loggerPort = c.loggerPort;
            }
        }
        this.output = '.webpack';
        this.startLogic = this.startLogic.bind(this);
        this.getHooks = this.getHooks.bind(this);
    }
    async writeJSONStats(type, stats, statsOptions, suffix) {
        if (!stats)
            return;
        d(`Writing JSON stats for ${type} config`);
        const jsonStats = stats.toJson(statsOptions);
        const jsonStatsFilename = path_1.default.resolve(this.baseDir, type, `stats-${suffix}.json`);
        await fs_extra_1.default.writeJson(jsonStatsFilename, jsonStats, { spaces: 2 });
    }
    get configGenerator() {
        if (!this._configGenerator) {
            this._configGenerator = new WebpackConfig_1.default(this.config, this.projectDir, this.baseDir, this.isProd, this.port);
        }
        return this._configGenerator;
    }
    getHooks() {
        return {
            prePackage: [
                (0, plugin_base_1.namedHookWithTaskFn)(async (task, config, platform, arch) => {
                    if (!task) {
                        throw new Error('Incompatible usage of webpack-plugin prePackage hook');
                    }
                    this.isProd = true;
                    await fs_extra_1.default.remove(this.baseDir);
                    await (0, core_utils_1.listrCompatibleRebuildHook)(this.projectDir, await (0, core_utils_1.getElectronVersion)(this.projectDir, await fs_extra_1.default.readJson(path_1.default.join(this.projectDir, 'package.json'))), platform, arch, config.rebuildConfig, task, chalk_1.default.cyan('[plugin-webpack] '));
                }, 'Preparing native dependencies'),
                (0, plugin_base_1.namedHookWithTaskFn)(async () => {
                    await this.compileMain();
                    await this.compileRenderers();
                }, 'Building webpack bundles'),
            ],
            postStart: async (_config, child) => {
                d('hooking electron process exit');
                child.on('exit', () => {
                    if (child.restarted)
                        return;
                    this.exitHandler({ cleanup: true, exit: true });
                });
            },
            resolveForgeConfig: this.resolveForgeConfig,
            packageAfterCopy: this.packageAfterCopy,
        };
    }
    devServerOptions() {
        var _a, _b;
        const cspDirectives = (_a = this.config.devContentSecurityPolicy) !== null && _a !== void 0 ? _a : "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-eval' 'unsafe-inline' data:";
        const defaults = {
            hot: true,
            devMiddleware: {
                writeToDisk: true,
            },
            historyApiFallback: true,
        };
        const overrides = {
            port: this.port,
            setupExitSignals: true,
            static: path_1.default.resolve(this.baseDir, 'renderer'),
            headers: {
                'Content-Security-Policy': cspDirectives,
            },
        };
        return (0, webpack_merge_1.merge)(defaults, (_b = this.config.devServer) !== null && _b !== void 0 ? _b : {}, overrides);
    }
    async startLogic() {
        if (this.alreadyStarted)
            return false;
        this.alreadyStarted = true;
        await fs_extra_1.default.remove(this.baseDir);
        const logger = new web_multi_logger_1.default(this.loggerPort);
        this.loggers.push(logger);
        await logger.start();
        return {
            tasks: [
                {
                    title: 'Compiling main process code',
                    task: async () => {
                        await this.compileMain(true, logger);
                    },
                    options: {
                        showTimer: true,
                    },
                },
                {
                    title: 'Launching dev servers for renderer process code',
                    task: async (_, task) => {
                        await this.launchRendererDevServers(logger);
                        task.output = `Output Available: ${chalk_1.default.cyan(`http://localhost:${this.loggerPort}`)}\n`;
                    },
                    options: {
                        persistentOutput: true,
                        showTimer: true,
                    },
                },
            ],
            result: false,
        };
    }
}
exports.default = WebpackPlugin;
exports.WebpackPlugin = WebpackPlugin;
//# sourceMappingURL=WebpackPlugin.js.map