import commander from 'commander';

commander
    .version(__VERSION__, '-v, --version')
    .allowUnknownOption()
    .command('apply', 'Apply config to a kong server', {isDefault: true})
    .command('dump', 'Dump the configuration from a kong server')
    .command('prune', 'Rewrites config omitting any service, route, global plugin or service/route plugin marked "ensure: removed"')
    .parse(process.argv);
