// This command will remove services, routes and plugins (global and for
// services/routes) that have been marked "ensure: removed" from a kongfig
// file. This script does not currently remove consumers certificates or
// upstreams

import program from 'commander';
import remove from 'lodash.remove';

import { configLoader, resolvePath, sanitizeConfigForSafeWrite } from './configLoader';
import { writeFileSync } from 'fs';
import { pretty } from './prettyConfig';
import { shouldBeRemoved } from './utils'

program
  .version(require("../package.json").version)
  .option('--path <value>', 'Path to the configuration file')
  .option('--output <value>', 'File with updated route ids overwrites path by default')
  .parse(process.argv);

let [config, envVarPointers] = configLoader(program.path);
let output = resolvePath(program.output || program.path);

remove(config.plugins, shouldBeRemoved);
remove(config.services, shouldBeRemoved);

config.services.forEach(function(service) {
  remove(service.plugins, shouldBeRemoved);
  remove(service.routes, shouldBeRemoved);

  service.routes.forEach(function(route) {
    remove(route.plugins, shouldBeRemoved);
  });
});

sanitizeConfigForSafeWrite(config, envVarPointers);
const yamlConfig = pretty('yaml')(config);
writeFileSync(output, yamlConfig);
