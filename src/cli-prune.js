import program from 'commander';
import remove from 'lodash.remove';

import { configLoader, resolvePath } from './configLoader';
import { writeFileSync } from 'fs';
import { pretty } from './prettyConfig';

program
  .version(require("../package.json").version)
  .option('--path <value>', 'Path to the configuration file')
  .option('--output <value>', 'File with updated route ids overwrites path by default')
  .parse(process.argv);

let config = configLoader(program.path);
let output = resolvePath(program.output || program.path);

remove(config.plugins, is_item_removed);
remove(config.services, is_item_removed);

config.services.forEach(function(service) {
  remove(service.plugins, is_item_removed);
  remove(service.routes, is_item_removed);

  service.routes.forEach(function(route) {
    remove(route.plugins, is_item_removed);
  });
});

const yaml_config = pretty('yaml')(config);
writeFileSync(output, yaml_config);

function is_item_removed(item) {
  return item.ensure == 'removed'
}
