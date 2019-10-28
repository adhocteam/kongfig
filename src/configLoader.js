import fs from 'fs';
import mapDeep from 'deepdash/mapDeep';
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

    let rawConfig;
    if(/(\.yml)|(\.yaml)/.test(configPath)) {
        rawConfig = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'));
    } else if (/(\.json)/.test(configPath)) {
        rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        log.error(`${configPath} is not a supported Kongfig config format. Supported formats are YAML and JSON.`);
        process.exit(1);
    }

    return mapDeep(rawConfig, configValue => {
        if (typeof configValue !== 'string') {
            return configValue;
        }

        return configValue.replace(/\$\{(.+)\}/g, (match, variableName) => {
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
    });
}

export function resolvePath(configPath) {
    if (path.isAbsolute(configPath)) {
        return configPath;
    }

    return path.resolve(process.cwd(), configPath);
}
