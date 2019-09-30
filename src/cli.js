import commander from 'commander';

let pkg = require("../package.json");

commander
    .version(pkg.version)
    .allowUnknownOption()
    .command('apply', 'Apply config to a kong server', {isDefault: true})
    .command('dump', 'Dump the configuration from a kong server')
    .command('prune', 'Remove any items marked "ensure: removed"')
    .parse(process.argv);
