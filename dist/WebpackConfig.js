"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const debug_1 = __importDefault(require("debug"));
const html_webpack_plugin_1 = __importDefault(require("html-webpack-plugin"));
const webpack_1 = require("webpack");
const webpack_merge_1 = require("webpack-merge");
const AssetRelocatorPatch_1 = __importDefault(require("./util/AssetRelocatorPatch"));
const processConfig_1 = __importDefault(require("./util/processConfig"));
const rendererTypeUtils_1 = require("./util/rendererTypeUtils");
const mini_css_extract_plugin_1 = __importDefault(require("mini-css-extract-plugin"));
const d = (0, debug_1.default)('electron-forge:plugin:webpack:webpackconfig');
class WebpackConfigGenerator {
    constructor(pluginConfig, projectDir, webpackDir, isProd, port) {
        // Users can override this method in a subclass to provide custom logic or
        // configuration parameters.
        this.preprocessConfig = async (config) => config({}, {
            mode: this.mode,
        });
        this.pluginConfig = pluginConfig;
        this.projectDir = projectDir;
        this.webpackDir = webpackDir;
        this.isProd = isProd;
        this.port = port;
        this.renderDir = 'renderer';
        this.mainDir = 'main';
        this.preloadDir = 'preload';
        d('Config mode:', this.mode);
    }
    async resolveConfig(config) {
        const rawConfig = typeof config === 'string'
            ? // eslint-disable-next-line @typescript-eslint/no-var-requires
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
            return `\`file://$\{require('path').resolve(__dirname, '..', '${inRendererDir ? this.renderDir : '.'}', '${!entryPoint.isMain ? entryPoint.name : ''}', '${basename}')}\``;
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
        if (!(0, rendererTypeUtils_1.isNoWindow)(entryPoint)) {
            if (this.isProd) {
                return `require('path').resolve(__dirname, '../${this.preloadDir}', '${!entryPoint.isMain ? entryPoint.name : ''}', 'preload.js')`;
            }
            return `'${path_1.default
                .resolve(this.webpackDir, this.preloadDir, !entryPoint.isMain ? entryPoint.name : '', 'preload.js')
                .replace(/\\/g, '\\\\')}'`;
        }
        else {
            // If this entry-point has no configured preload script just map this constant to `undefined`
            // so that any code using it still works.  This makes quick-start / docs simpler.
            return 'undefined';
        }
    }
    getDefines(inRendererDir = true) {
        const defines = {};
        if (!this.pluginConfig.renderer.entryPoints ||
            !Array.isArray(this.pluginConfig.renderer.entryPoints)) {
            throw new Error('Required config option "renderer.entryPoints" has not been defined');
        }
        for (const entryPoint of this.pluginConfig.renderer.entryPoints) {
            const entryKey = this.toEnvironmentVariable(entryPoint);
            defines[entryKey] = this.rendererEntryPoint(entryPoint, inRendererDir, (0, rendererTypeUtils_1.isLocalWindow)(entryPoint) ? 'index.html' : 'index.js');
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
    async getPreloadConfigForEntryPoint(entryPoint) {
        if (!entryPoint.preload) {
            return {};
        }
        const rendererConfig = await this.resolveConfig(entryPoint.preload.config || this.pluginConfig.renderer.config);
        //filter webpack html plugin and css plugin from renderer config
        if (rendererConfig.plugins) {
            rendererConfig.plugins = rendererConfig.plugins.filter((plugin) => !(plugin.constructor.name == 'HtmlWebpackPlugin' ||
                plugin.constructor.name == 'MiniCssExtractPlugin'));
        }
        const prefixedEntries = entryPoint.prefixedEntries || [];
        return (0, webpack_merge_1.merge)({
            devtool: this.rendererSourceMapOption,
            mode: this.mode,
            entry: prefixedEntries.concat([entryPoint.preload.js]),
            output: {
                path: path_1.default.resolve(this.webpackDir, this.preloadDir, entryPoint.isMain ? '' : entryPoint.name),
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
        const rendererConfig = await this.resolveConfig(this.pluginConfig.renderer.config);
        //check if renderer config has html plugin
        if (rendererConfig.plugins) {
            rendererConfig.plugins = rendererConfig.plugins.filter((plugin) => !(plugin.constructor.name == 'HtmlWebpackPlugin' ||
                plugin.constructor.name == 'MiniCssExtractPlugin'));
        }
        return Promise.all(entryPoints.map(async (entryPoint) => {
            const dir = entryPoint.isMain ? '' : entryPoint.name + '/';
            if ((0, rendererTypeUtils_1.isLocalWindow)(entryPoint) || (0, rendererTypeUtils_1.isNoWindow)(entryPoint))
                return Promise.resolve((0, webpack_merge_1.merge)({
                    target: this.rendererTarget(entryPoint),
                    devtool: this.rendererSourceMapOption,
                    mode: this.mode,
                    output: {
                        path: path_1.default.resolve(this.webpackDir, this.renderDir),
                        filename: dir + '[name].index.js',
                        chunkFilename: this.isProd
                            ? dir + '[name].[contenthash:8].chunk.js'
                            : dir + '[name].chunk.js',
                        assetModuleFilename: dir + 'assets/[contenthash][ext][query]',
                        globalObject: 'self',
                        ...(this.isProd ? {} : { publicPath: '/' }),
                    },
                    node: {
                        __dirname: false,
                        __filename: false,
                    },
                    entry: {
                        [entryPoint.name]: (entryPoint.prefixedEntries || []).concat([
                            entryPoint.js,
                        ]),
                    },
                    plugins: [
                        (0, rendererTypeUtils_1.isLocalWindow)(entryPoint) &&
                            new html_webpack_plugin_1.default({
                                title: entryPoint.name,
                                template: entryPoint.html,
                                filename: `${dir}index.html`,
                                chunks: [entryPoint.name].concat(entryPoint.additionalChunks || []),
                            }),
                        (0, rendererTypeUtils_1.isLocalWindow)(entryPoint) &&
                            new mini_css_extract_plugin_1.default({
                                filename: dir +
                                    (!this.isProd
                                        ? '[name].css'
                                        : '[name].[contenthash].css'),
                                chunkFilename: dir +
                                    (!this.isProd ? '[id].css' : '[id].[contenthash].css'),
                            }),
                        new AssetRelocatorPatch_1.default(this.isProd, !!this.pluginConfig.renderer.nodeIntegration),
                    ].filter(Boolean),
                }, rendererConfig || {}));
            else if ((0, rendererTypeUtils_1.isPreloadOnly)(entryPoint) && entryPoint.preload) {
                return this.getPreloadConfigForEntryPoint(entryPoint);
            }
            else
                throw new Error(`Unknown entry point type`);
        }));
    }
}
exports.default = WebpackConfigGenerator;
//# sourceMappingURL=WebpackConfig.js.map