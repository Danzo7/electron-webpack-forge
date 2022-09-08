"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const trivialConfigurationFactory = (config) => () => config;
// Ensure processing logic is run for both `Configuration` and
// `ConfigurationFactory` config variants.
const processConfig = async (processor, config) => {
    const configFactory = typeof config === 'function' ? config : trivialConfigurationFactory(config);
    return processor(configFactory);
};
exports.default = processConfig;
//# sourceMappingURL=processConfig.js.map