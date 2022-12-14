import path from 'path';
import debug from 'debug';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack, {
  Configuration,
  DefinePlugin,
  WebpackPluginInstance,
} from 'webpack';
import { merge as webpackMerge } from 'webpack-merge';

import {
  WebpackPluginConfig,
  WebpackPluginEntryPoint,
  WebpackPluginEntryPointLocalWindow,
  WebpackPluginEntryPointPreloadOnly,
} from './Config';
import AssetRelocatorPatch from './util/AssetRelocatorPatch';
import processConfig from './util/processConfig';
import {
  isLocalWindow,
  isNoWindow,
  isPreloadOnly,
} from './util/rendererTypeUtils';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

type EntryType = string | string[] | Record<string, string | string[]>;
type WebpackMode = 'production' | 'development';

const d = debug('electron-forge:plugin:webpack:webpackconfig');

export type ConfigurationFactory = (
  env: string | Record<string, string | boolean | number> | unknown,
  args: Record<string, unknown>,
) => Configuration | Promise<Configuration>;

export default class WebpackConfigGenerator {
  private isProd: boolean;

  private pluginConfig: WebpackPluginConfig;

  private port: number;

  private projectDir: string;

  private webpackDir: string;

  private renderDir: string;

  private mainDir: string;

  private preloadDir: string;

  constructor(
    pluginConfig: WebpackPluginConfig,
    projectDir: string,
    webpackDir: string,
    isProd: boolean,
    port: number,
  ) {
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

  async resolveConfig(
    config: Configuration | ConfigurationFactory | string,
  ): Promise<Configuration> {
    const rawConfig =
      typeof config === 'string'
        ? // eslint-disable-next-line @typescript-eslint/no-var-requires
          (require(path.resolve(this.projectDir, config)) as
            | Configuration
            | ConfigurationFactory)
        : config;

    return processConfig(this.preprocessConfig, rawConfig);
  }

  // Users can override this method in a subclass to provide custom logic or
  // configuration parameters.
  preprocessConfig = async (
    config: ConfigurationFactory,
  ): Promise<Configuration> =>
    config(
      {},
      {
        mode: this.mode,
      },
    );

  get mode(): WebpackMode {
    return this.isProd ? 'production' : 'development';
  }

  get rendererSourceMapOption(): string {
    return this.isProd ? 'source-map' : 'eval-source-map';
  }

  rendererTarget(entryPoint: WebpackPluginEntryPoint): string {
    return entryPoint.nodeIntegration ??
      this.pluginConfig.renderer.nodeIntegration
      ? 'electron-renderer'
      : 'web';
  }

  rendererEntryPoint(
    entryPoint: WebpackPluginEntryPoint,
    inRendererDir: boolean,
    basename: string,
  ): string {
    if (this.isProd) {
      return `\`file://$\{require('path').resolve(__dirname, '..', '${
        inRendererDir ? this.renderDir : '.'
      }', '${!entryPoint.isMain ? entryPoint.name : ''}', '${basename}')}\``;
    }
    const baseUrl = `http://localhost:${this.port}/${
      !entryPoint.isMain ? entryPoint.name : ''
    }`;
    if (basename !== 'index.html') {
      return `'${baseUrl}/${basename}'`;
    }
    return `'${baseUrl}'`;
  }

  toEnvironmentVariable(
    entryPoint: WebpackPluginEntryPoint,
    preload = false,
  ): string {
    const suffix = preload ? '_PRELOAD_WEBPACK_ENTRY' : '_WEBPACK_ENTRY';
    return `${entryPoint.name.toUpperCase().replace(/ /g, '_')}${suffix}`;
  }

  getPreloadDefine(entryPoint: WebpackPluginEntryPoint): string {
    if (!isNoWindow(entryPoint)) {
      if (this.isProd) {
        return `require('path').resolve(__dirname, '../${this.preloadDir}', '${
          !entryPoint.isMain ? entryPoint.name : ''
        }', 'preload.js')`;
      }
      return `'${path
        .resolve(
          this.webpackDir,
          this.preloadDir,
          !entryPoint.isMain ? entryPoint.name : '',
          'preload.js',
        )
        .replace(/\\/g, '\\\\')}'`;
    } else {
      // If this entry-point has no configured preload script just map this constant to `undefined`
      // so that any code using it still works.  This makes quick-start / docs simpler.
      return 'undefined';
    }
  }

  getDefines(inRendererDir = true): Record<string, string> {
    const defines: Record<string, string> = {};
    if (
      !this.pluginConfig.renderer.entryPoints ||
      !Array.isArray(this.pluginConfig.renderer.entryPoints)
    ) {
      throw new Error(
        'Required config option "renderer.entryPoints" has not been defined',
      );
    }
    for (const entryPoint of this.pluginConfig.renderer.entryPoints) {
      const entryKey = this.toEnvironmentVariable(entryPoint);

      defines[entryKey] = this.rendererEntryPoint(
        entryPoint,
        inRendererDir,
        isLocalWindow(entryPoint) ? 'index.html' : 'index.js',
      );
      defines[`process.env.${entryKey}`] = defines[entryKey];

      const preloadDefineKey = this.toEnvironmentVariable(entryPoint, true);
      defines[preloadDefineKey] = this.getPreloadDefine(entryPoint);
      defines[`process.env.${preloadDefineKey}`] = defines[preloadDefineKey];
    }

    return defines;
  }

  async getMainConfig(): Promise<Configuration> {
    const mainConfig = await this.resolveConfig(this.pluginConfig.mainConfig);

    if (!mainConfig.entry) {
      throw new Error(
        'Required option "mainConfig.entry" has not been defined',
      );
    }
    const fix = (item: EntryType): EntryType => {
      if (typeof item === 'string') return (fix([item]) as string[])[0];
      if (Array.isArray(item)) {
        return item.map((val) =>
          val.startsWith('./') ? path.resolve(this.projectDir, val) : val,
        );
      }
      const ret: Record<string, string | string[]> = {};
      for (const key of Object.keys(item)) {
        ret[key] = fix(item[key]) as string | string[];
      }
      return ret;
    };
    mainConfig.entry = fix(mainConfig.entry as EntryType);

    return webpackMerge(
      {
        devtool: 'source-map',
        target: 'electron-main',
        mode: this.mode,
        output: {
          path: path.resolve(this.webpackDir, 'main'),
          filename: 'index.js',
          libraryTarget: 'commonjs2',
        },
        plugins: [new DefinePlugin(this.getDefines())],
        node: {
          __dirname: false,
          __filename: false,
        },
      },
      mainConfig || {},
    );
  }

  async getPreloadConfigForEntryPoint(
    entryPoint:
      | WebpackPluginEntryPointLocalWindow
      | WebpackPluginEntryPointPreloadOnly,
  ): Promise<Configuration> {
    if (!entryPoint.preload) {
      return {};
    }

    const rendererConfig = await this.resolveConfig(
      entryPoint.preload.config || this.pluginConfig.renderer.config,
    );
    //filter webpack html plugin and css plugin from renderer config
    if (rendererConfig.plugins) {
      rendererConfig.plugins = rendererConfig.plugins.filter(
        (plugin) =>
          !(
            plugin.constructor.name == 'HtmlWebpackPlugin' ||
            plugin.constructor.name == 'MiniCssExtractPlugin'
          ),
      );
    }
    const prefixedEntries = entryPoint.prefixedEntries || [];

    return webpackMerge(
      {
        devtool: this.rendererSourceMapOption,
        mode: this.mode,
        entry: prefixedEntries.concat([entryPoint.preload.js]),
        output: {
          path: path.resolve(
            this.webpackDir,
            this.preloadDir,
            entryPoint.isMain ? '' : entryPoint.name,
          ),
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
      },
      rendererConfig || {},
      { target: 'electron-preload' },
    );
  }

  async getRendererConfig(
    entryPoints: WebpackPluginEntryPoint[],
  ): Promise<webpack.Configuration[]> {
    const rendererConfig = await this.resolveConfig(
      this.pluginConfig.renderer.config,
    );

    //check if renderer config has html plugin
    if (rendererConfig.plugins) {
      rendererConfig.plugins = rendererConfig.plugins.filter(
        (plugin) =>
          !(
            plugin.constructor.name == 'HtmlWebpackPlugin' ||
            plugin.constructor.name == 'MiniCssExtractPlugin'
          ),
      );
    }
    return Promise.all(
      entryPoints.map(async (entryPoint) => {
        const dir = entryPoint.isMain ? '' : entryPoint.name + '/';
        if (isLocalWindow(entryPoint) || isNoWindow(entryPoint))
          return Promise.resolve(
            webpackMerge(
              {
                target: this.rendererTarget(entryPoint),
                devtool: this.rendererSourceMapOption,
                mode: this.mode,
                output: {
                  path: path.resolve(this.webpackDir, this.renderDir),
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
                  isLocalWindow(entryPoint) &&
                    (new HtmlWebpackPlugin({
                      title: entryPoint.name,
                      template: entryPoint.html,
                      filename: `${dir}index.html`,
                      chunks: [entryPoint.name].concat(
                        entryPoint.additionalChunks || [],
                      ),
                    }) as WebpackPluginInstance),
                  isLocalWindow(entryPoint) &&
                    new MiniCssExtractPlugin({
                      filename:
                        dir +
                        (!this.isProd
                          ? '[name].css'
                          : '[name].[contenthash].css'),
                      chunkFilename:
                        dir +
                        (!this.isProd ? '[id].css' : '[id].[contenthash].css'),
                    }),
                  new AssetRelocatorPatch(
                    this.isProd,
                    !!this.pluginConfig.renderer.nodeIntegration,
                  ),
                ].filter(Boolean) as WebpackPluginInstance[],
              },
              rendererConfig || {},
            ),
          );
        else if (isPreloadOnly(entryPoint) && entryPoint.preload) {
          return this.getPreloadConfigForEntryPoint(entryPoint);
        } else throw new Error(`Unknown entry point type`);
      }),
    );
  }
}
