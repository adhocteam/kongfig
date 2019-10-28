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
    const compiledConfig = rawConfig.replace(/\$\{(.+)\}/g, (match, variableName) => {
        const allowedNameRegex = /^[_a-zA-Z0-9]+$/;
        if (!allowedNameRegex.test(variableName)) {
            log.error(`Configuration variable name ${variableName} is invalid.\nAllowed characters are letters, numbers, and underscores.`);
            process.exit(1);
        }

        if (process.env[variableName] === undefined) {
            log.error(`Configuration value ${variableName} was not present in the environment.`);
            process.exit(1);
        }
        return process.env[variableName];
    });

    if(/(\.yml)|(\.yaml)/.test(configPath)) {
        return yaml.safeLoad(compiledConfig);
    }

    if (/(\.json)/.test(configPath)) {
        return JSON.parse(compiledConfig);
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
