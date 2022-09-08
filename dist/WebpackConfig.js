"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
const html_webpack_plugin_1 = __importDefault(require("html-webpack-plugin"));
const path_1 = __importDefault(require("path"));
const webpack_1 = require("webpack");
const webpack_merge_1 = require("webpack-merge");
const AssetRelocatorPatch_1 = __importDefault(require("./util/AssetRelocatorPatch"));
const processConfig_1 = __importDefault(require("./util/processConfig"));
const d = (0, debug_1.default)('electron-forge:plugin:webpack:webpackconfig');
class WebpackConfigGenerator {
    constructor(pluginConfig, projectDir, isProd, port) {
        var _a;
        // Users can override this method in a subclass to provide custom logic or
        // configuration parameters.
        this.preprocessConfig = async (config) => config({}, {
            mode: this.mode,
        });
        this.pluginConfig = pluginConfig;
        this.projectDir = projectDir;
        this.webpackDir = path_1.default.resolve(projectDir, (_a = pluginConfig.output) !== null && _a !== void 0 ? _a : '.webpack');
        this.isProd = isProd;
        this.port = port;
        d('Config mode:', this.mode);
    }
    async resolveConfig(config) {
        const rawConfig = typeof config === 'string'
            ? // eslint-disable-next-line import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires
                require(path_1.default.resolve(this.projectDir, config))
            : config;
        return (0, processConfig_1.default)(this.preprocessConfig, rawConfig);
    }
    get mode() {
        return this.isProd ? 'production' : 'development';
    }
    get rendererSourceMapOption() {
        return this.isProd ? 'source-map' : 'eval-source-map';
    }
    rendererTarget(entryPoint) {
        var _a;
        return ((_a = entryPoint.nodeIntegration) !== null && _a !== void 0 ? _a : this.pluginConfig.renderer.nodeIntegration)
            ? 'electron-renderer'
            : 'web';
    }
    rendererEntryPoint(entryPoint, inRendererDir, basename) {
        if (this.isProd) {
            return `\`file://$\{require('path').resolve(__dirname, '..', '${inRendererDir ? 'renderer' : '.'}', '${!entryPoint.isMain ? entryPoint.name : ''}', '${basename}')}\``;
        }
        const baseUrl = `http://localhost:${this.port}/${!entryPoint.isMain ? entryPoint.name : ''}`;
        if (basename !== 'index.html') {
            return `'${baseUrl}/${basename}'`;
        }
        return `'${baseUrl}'`;
    }
    toEnvironmentVariable(entryPoint, preload = false) {
        const suffix = preload ? '_PRELOAD_WEBPACK_ENTRY' : '_WEBPACK_ENTRY';
        return `${entryPoint.name.toUpperCase().replace(/ /g, '_')}${suffix}`;
    }
    getPreloadDefine(entryPoint) {
        if (entryPoint.preload) {
            if (this.isProd) {
                return `require('path').resolve(__dirname, '../renderer', '${!entryPoint.isMain ? entryPoint.name : ''}', 'preload.js')`;
            }
            return `'${path_1.default
                .resolve(this.webpackDir, 'renderer', !entryPoint.isMain ? entryPoint.name : '', 'preload.js')
                .replace(/\\/g, '\\\\')}'`;
        }
        // If this entry-point has no configured preload script just map this constant to `undefined`
        // so that any code using it still works.  This makes quick-start / docs simpler.
        return 'undefined';
    }
    getDefines(inRendererDir = true) {
        const defines = {};
        if (!this.pluginConfig.renderer.entryPoints ||
            !Array.isArray(this.pluginConfig.renderer.entryPoints)) {
            throw new Error('Required config option "renderer.entryPoints" has not been defined');
        }
        for (const entryPoint of this.pluginConfig.renderer.entryPoints) {
            const entryKey = this.toEnvironmentVariable(entryPoint);
            defines[entryKey] = this.rendererEntryPoint(entryPoint, inRendererDir, entryPoint.html ? 'index.html' : 'index.js');
            defines[`process.env.${entryKey}`] = defines[entryKey];
            const preloadDefineKey = this.toEnvironmentVariable(entryPoint, true);
            defines[preloadDefineKey] = this.getPreloadDefine(entryPoint);
            defines[`process.env.${preloadDefineKey}`] = defines[preloadDefineKey];
        }
        return defines;
    }
    async getMainConfig() {
        const mainConfig = await this.resolveConfig(this.pluginConfig.mainConfig);
        if (!mainConfig.entry) {
            throw new Error('Required option "mainConfig.entry" has not been defined');
        }
        const fix = (item) => {
            if (typeof item === 'string')
                return fix([item])[0];
            if (Array.isArray(item)) {
                return item.map((val) => val.startsWith('./') ? path_1.default.resolve(this.projectDir, val) : val);
            }
            const ret = {};
            for (const key of Object.keys(item)) {
                ret[key] = fix(item[key]);
            }
            return ret;
        };
        mainConfig.entry = fix(mainConfig.entry);
        return (0, webpack_merge_1.merge)({
            devtool: 'source-map',
            target: 'electron-main',
            mode: this.mode,
            output: {
                path: path_1.default.resolve(this.webpackDir, 'main'),
                filename: 'index.js',
                libraryTarget: 'commonjs2',
            },
            plugins: [new webpack_1.DefinePlugin(this.getDefines())],
            node: {
                __dirname: false,
                __filename: false,
            },
        }, mainConfig || {});
    }
    async getPreloadRendererConfig(parentPoint, entryPoint) {
        const rendererConfig = await this.resolveConfig(entryPoint.config || this.pluginConfig.renderer.config);
        //filter webpack html plugin and css plugin from renderer config
        if (rendererConfig.plugins) {
            rendererConfig.plugins = rendererConfig.plugins.filter((plugin) => !(plugin.constructor.name == "HtmlWebpackPlugin" || plugin.constructor.name == "MiniCssExtractPlugin"));
        }
        console.log(rendererConfig.plugins);
        const prefixedEntries = entryPoint.prefixedEntries || [];
        return (0, webpack_merge_1.merge)({
            devtool: this.rendererSourceMapOption,
            mode: this.mode,
            entry: prefixedEntries.concat([entryPoint.js]),
            output: {
                path: path_1.default.resolve(this.webpackDir, 'renderer', parentPoint.isMain ? "" : parentPoint.name),
                filename: 'preload.js',
                chunkFilename: this.isProd
                    ? '[name].[contenthash:8].chunk.js'
                    : '[name].chunk.js',
                assetModuleFilename: 'assets/[contenthash][ext][query]',
            },
            node: {
                __dirname: false,
                __filename: false,
            },
        }, rendererConfig || {}, { target: 'electron-preload' });
    }
    async getRendererConfig(entryPoints) {
        var _a, _b;
        const rendererConfig = await this.resolveConfig(this.pluginConfig.renderer.config);
        //check if renderer config has html plugin
        const hasHtmlPlugin = (_b = (_a = rendererConfig === null || rendererConfig === void 0 ? void 0 : rendererConfig.plugins) === null || _a === void 0 ? void 0 : _a.some((plugin) => plugin.constructor.name == "HtmlWebpackPlugin")) !== null && _b !== void 0 ? _b : false;
        const defines = this.getDefines(false);
        return entryPoints.map((entryPoint) => {
            const config = (0, webpack_merge_1.merge)({
                entry: {
                    [entryPoint.name]: (entryPoint.prefixedEntries || []).concat([
                        entryPoint.js,
                    ]),
                },
                target: this.rendererTarget(entryPoint),
                devtool: this.rendererSourceMapOption,
                mode: this.mode,
                output: {
                    path: path_1.default.resolve(this.webpackDir, 'renderer'),
                    filename: (entryPoint.isMain ? "" : "[name]/") + 'index.js',
                    chunkFilename: this.isProd
                        ? '[name].[contenthash:8].chunk.js'
                        : '[name].chunk.js',
                    assetModuleFilename: 'assets/[contenthash][ext][query]',
                    globalObject: 'self',
                    ...(this.isProd ? {} : { publicPath: '/' }),
                },
                node: {
                    __dirname: false,
                    __filename: false,
                },
                plugins: [
                    ...(entryPoint.html && !hasHtmlPlugin
                        ? [
                            new html_webpack_plugin_1.default({
                                title: entryPoint.name,
                                template: entryPoint.html,
                                filename: `${entryPoint.isMain ? "" : (entryPoint.name + "/")}index.html`,
                                chunks: [entryPoint.name].concat(entryPoint.additionalChunks || []),
                            }),
                        ]
                        : []),
                    new webpack_1.DefinePlugin(defines),
                    new AssetRelocatorPatch_1.default(this.isProd, !!this.pluginConfig.renderer.nodeIntegration),
                ],
            }, rendererConfig || {});
            return config;
        });
    }
}
exports.default = WebpackConfigGenerator;
//# sourceMappingURL=WebpackConfig.js.map