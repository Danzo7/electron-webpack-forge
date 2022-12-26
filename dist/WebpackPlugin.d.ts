import { PluginBase } from '@electron-forge/plugin-base';
import { ForgeMultiHookMap, ResolvedForgeConfig, StartResult } from '@electron-forge/shared-types';
import Logger from '@electron-forge/web-multi-logger';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { WebpackPluginConfig } from './Config';
import WebpackConfigGenerator from './WebpackConfig';
type WebpackToJsonOptions = Parameters<webpack.Stats['toJson']>[0];
export default class WebpackPlugin extends PluginBase<WebpackPluginConfig> {
    name: string;
    private isProd;
    private projectDir;
    private baseDir;
    private _configGenerator;
    private watchers;
    private servers;
    private loggers;
    private port;
    private loggerPort;
    private output;
    constructor(c: WebpackPluginConfig);
    private isValidPort;
    exitHandler: (options: {
        cleanup?: boolean;
        exit?: boolean;
    }, err?: Error) => void;
    writeJSONStats(type: string, stats: webpack.Stats | undefined, statsOptions: WebpackToJsonOptions, suffix: string): Promise<void>;
    private runWebpack;
    init: (dir: string) => void;
    setDirectories: (dir: string) => void;
    get configGenerator(): WebpackConfigGenerator;
    getHooks(): ForgeMultiHookMap;
    resolveForgeConfig: (forgeConfig: ResolvedForgeConfig) => Promise<ResolvedForgeConfig>;
    packageAfterCopy: (_forgeConfig: ResolvedForgeConfig, buildPath: string) => Promise<void>;
    compileMain: (watch?: boolean, logger?: Logger) => Promise<void>;
    compileRenderers: (watch?: boolean) => Promise<void>;
    launchRendererDevServers: (logger: Logger) => Promise<void>;
    devServerOptions(): WebpackDevServer.Configuration;
    private alreadyStarted;
    startLogic(): Promise<StartResult>;
}
export { WebpackPlugin, WebpackPluginConfig };
//# sourceMappingURL=WebpackPlugin.d.ts.map