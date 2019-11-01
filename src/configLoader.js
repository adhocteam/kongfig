import fs from 'fs';
import mapDeep from 'deepdash/mapDeep';
import path from 'path';
import yaml from 'js-yaml';
import mergeWith from 'lodash/mergeWith';
import lookUpEnvironmentVar from './environment';

const ENV_VAR_REGEX = /\$\{(.+?)\}/g;

export const log = {
    info: message => console.log(message.green),
    error: message => console.error(message.red)
};

export function configLoader(configPath) {
    if (!fs.existsSync(configPath)) {
        log.error(`Supplied --path '${configPath}' doesn't exist`);
        throw new Error(`Supplied --path '${configPath}' doesn't exist`);
    }

    let rawConfig;
    if(/(\.yml)|(\.yaml)/.test(configPath)) {
        rawConfig = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'));
    } else if (/(\.json)/.test(configPath)) {
        rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        log.error(`${configPath} is not a supported Kongfig config format. Supported formats are YAML and JSON.`);
        throw new Error(`${configPath} is not a supported Kongfig config format`);
    }

    return mapDeep(rawConfig, configValue => {
        if (typeof configValue !== 'string') {
            return configValue;
        }

        return configValue.replace(ENV_VAR_REGEX, (match, variableName) => {
            return lookUpEnvironmentVar(variableName);
        });
    });
}

export function resolvePath(configPath) {
    if (path.isAbsolute(configPath)) {
        return configPath;
    }

    return path.resolve(process.cwd(), configPath);
}

// with the introduction of environment variable subsitution, we need to restore environment
// variables in the written config for consistency + not writing secrets to disk.
export function sanitizeConfigForSafeWrite(oldConfig, newConfig) {
    return mergeWith(oldConfig, newConfig, (originalValue, updatedValue) => {
        if (!ENV_VAR_REGEX.test(originalValue)) {
            return updatedValue;
        }

        return originalValue;
    })
}
