import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getEnvironmentVarPointers, lookUpEnvironmentVar } from './environment';
import jsonPointer from 'json-ptr';

const GLOBAL_ENV_VAR_REGEX = /\$\{(.+?)\}/g;

export const log = {
    info: message => console.log(message.green),
    error: message => console.error(message.red)
};

export function configLoader(configPath) {
    if (!fs.existsSync(configPath)) {
        log.error(`Supplied --path '${configPath}' doesn't exist`);
        throw new Error(`Supplied --path '${configPath}' doesn't exist`);
    }

    let config;
    if(/(\.yml)|(\.yaml)/.test(configPath)) {
        config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'));
    } else if (/(\.json)/.test(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        log.error(`${configPath} is not a supported Kongfig config format. Supported formats are YAML and JSON.`);
        throw new Error(`${configPath} is not a supported Kongfig config format`);
    }

    const envPointers = getEnvironmentVarPointers(config);
    for (const pointer in envPointers) {
        const compiledValue = envPointers[pointer].replace(GLOBAL_ENV_VAR_REGEX, (match, variableName) => {
            return lookUpEnvironmentVar(variableName);
        });

        jsonPointer.set(config, pointer, compiledValue);
    }

    return [config, envPointers];
}

export function resolvePath(configPath) {
    if (path.isAbsolute(configPath)) {
        return configPath;
    }

    return path.resolve(process.cwd(), configPath);
}

/*
    With the introduction of environment variable subsitution, we need to restore environment
    variables in the written config for consistency + not writing secrets to disk. This replacement
    function assumes that Kong will never change the value of a config property that contains a
    secret. We can currently assume that Kong will never change the value of any property, period.
    This function is safe against Kong removing fields.
*/
 export function sanitizeConfigForSafeWrite(config, envPointers) {
    for (let pointer in envPointers) {
        if (jsonPointer.has(config, pointer)) {
            jsonPointer.set(config, pointer, envPointers[pointer]);
        }
    }
}
