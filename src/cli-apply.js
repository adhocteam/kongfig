import execute from './core';
import adminApi from './adminApi';
import colors from 'colors';
import { configLoader, resolvePath } from './configLoader';
import program from 'commander';
import requester from './requester';
import {repeatableOptionCallback} from './utils';
import { screenLogger } from './logger';
import { writeFileSync } from 'fs';
import {pretty} from './prettyConfig';
import {addSchemasFromOptions, addSchemasFromConfig} from './consumerCredentials';
import isEqual from 'lodash.isequal';

program
    .version(require("../package.json").version)
    .option('--path <value>', 'Path to the configuration file')
    .option('--host <value>', 'Kong admin host (default: localhost:8001)')
    .option('--output <value>', 'File with updated route ids overwrites path by default')
    .option('--https', 'Use https for admin API requests')
    .option('--no-cache', 'Do not cache kong state in memory')
    .option('--no-remove-routes', 'Do not clean up old routes')
    .option('--no-local-state', 'Do not use local state')
    .option('--ignore-consumers', 'Do not sync consumers')
    .option('--dry-run', 'Print requests but do not send them')
    .option('--header [value]', 'Custom headers to be added to all requests', (nextHeader, headers) => { headers.push(nextHeader); return headers }, [])
    .option('--credential-schema <value>', 'Add custom auth plugin in <name>:<key> format. Ex: custom_jwt:key. Repeat option for multiple custom plugins', repeatableOptionCallback, [])
    .option('--socks <value>', 'Socks proxy to use to connect to Kong admin')
    .parse(process.argv);

if (!program.path) {
    console.error('--path to the config file is required'.red);
    process.exit(1);
}

try{
    addSchemasFromOptions(program.credentialSchema);
}catch(e){
    console.error(e.message.red);
    process.exit(1);
}

if (program.socks) {
    requester.setAgent(program.socks);
}

console.log(`Loading config ${program.path}`);

let config = configLoader(program.path);
let host = program.host || config.host || 'localhost:8001';
let https = program.https || config.https || false;
let ignoreConsumers = program.ignoreConsumers || !config.consumers || config.consumers.length === 0 || false;
let output = resolvePath(program.output || program.path);
let { localState, cache, removeRoutes, dryRun } = program;

config.headers = config.headers || [];

let headers = new Map();
([...config.headers, ...program.header])
    .map((h) => h.split(':'))
    .forEach(([name, value]) => headers.set(name, value));

headers
    .forEach((value, name) => requester.addHeader(name, value));

if (!host) {
    console.error('Kong admin host must be specified in config or --host'.red);
    process.exit(1);
}

if (ignoreConsumers) {
    config.consumers = [];
}
else {
    try{
        addSchemasFromConfig(config);
    } catch(e) {
        console.error(e.message.red);
        process.exit(1);
    }
}

console.log(`Apply config to ${host}`.green);

execute(config, adminApi({host, https, ignoreConsumers, cache}), screenLogger, removeRoutes, dryRun, localState)
    .then(pretty('yaml'))
    .then ((updatedConfig) => {
        if (!isEqual(config, updatedConfig ) && !dryRun) {
            console.log(`Writing output to ${output}`);
            writeFileSync(output, updatedConfig);
        } else {
            console.log('Config is up-to-date');
        }
        process.exit(0);
    })
    .catch(error => {
        console.error(`${error}`.red, '\n', error.stack);
        process.exit(1);
    });
