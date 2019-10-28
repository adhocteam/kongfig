import changeCase from 'change-case';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const log = {
    info: message => console.log(message.green),
    error: message => console.error(message.red)
};

export function configLoader(configPath) {
    if (!fs.existsSync(configPath)) {
        log.error(`Supplied --path '${configPath}' doesn't exist`.red);
        return process.exit(1);
    }

    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const compiledConfig = rawConfig.replace(/\$\{([A-Za-z_]+)\}\$/g, (match, variableName) => {
        if (process.env[variableName] === undefined) {
            throw new Error(`Configuration value ${variableName} was not present in the environment`)
        }
        return process.env[variableName];
    });

    if(/(\.yml)|(\.yaml)/.test(configPath)) {
        return yaml.safeLoad(compiledConfig);
    }

    if (/(\.json)/.test(configPath)) {
        return JSON.parse(compiledConfig);
    }

    if (/(\.js)/.test(configPath)) {
        try {
            let config = require(resolvePath(configPath));

            if (config === null || typeof config !== 'object' || Object.keys(config).length == 0) {
                log.error('Config file must export an object!\n' + CONFIG_SYNTAX_HELP);

                return process.exit(1);
            }

            return config;
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND' && e.message.indexOf(configPath) !== -1) {
                log.error('File %s does not exist!', configPath);
            } else {
                log.error('Invalid config file!\n  ' + e.stack);
            }

            return process.exit(1);
        }
    }
}

export function resolvePath(configPath) {
    if (path.isAbsolute(configPath)) {
        return configPath;
    }

    return path.resolve(process.cwd(), configPath);
}

const CONFIG_SYNTAX_HELP =
  '  module.exports = {\n' +
  '    // your config\n' +
  '  };\n';
