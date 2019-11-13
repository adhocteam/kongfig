import commander from 'commander';

commander
    .version(__VERSION__)
    .allowUnknownOption()
    .command('apply', 'Apply config to a kong server')
    .command('dump', 'Dump the configuration from a kong server')
    .command('prune', 'Rewrites config omitting any service, route, global plugin or service/route plugin marked "ensure: removed"')
    .command('version', 'A temporary alias for kongfig --version to support locally installed kongfig < 3.0.1')
    .parse(process.argv);
